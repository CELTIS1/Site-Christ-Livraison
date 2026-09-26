/* PARCOURS — L'ACCUEIL DU LIVREUR (26 septembre 2026, lot AC, v293)
     1. Premier lancement du jour : l'Accueil — « Bonjour Koffi », la phrase du jour, quatre chiffres,
        trois colonnes (Ma journée, Mon argent, Moi et CLT) ;
     2. chaque case mène à son écran ; le « retour » ramène à l'Accueil ;
     3. rouvert tout de suite : il retrouve son écran ; après une pause : l'Accueil ;
     4. téléphone et ordinateur, clair et nuit ; zéro erreur.
   Lancer à la main :  node tests/parcours/l-accueil-du-livreur.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, LIVREUR } from './_monde.mjs';

const monde = nouveauMonde();
const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const txt = async (sel) => ((await page.locator(sel).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const actif = async () => page.evaluate(() => (document.querySelector('#clt-bottomnav .nav.active') || {}).dataset?.nav || '');
const vieillir = () => page.evaluate(() => localStorage.setItem('test:vieillir', '1'));
const contraste = () => page.evaluate(() => {
  const lum = (s) => { const m = s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
  const fond = (el) => { while (el) { const b = getComputedStyle(el).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; el = el.parentElement; } return 'rgb(255,255,255)'; };
  const mauvais = [...document.querySelectorAll('#panel-accueil .ac-bonjour, #panel-accueil .ac-phrase, #panel-accueil .ac-chiffre-n, #panel-accueil .ac-chiffre-l, #panel-accueil .rc-etat, #panel-accueil .rc-case-txt small, #panel-accueil .rc-col-tete strong')].filter((el) => { const a = lum(getComputedStyle(el).color), b = lum(fond(el)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 4.5; });
  return mauvais.map((e) => e.className + ':' + e.textContent.slice(0, 20)).join(' | ');
});

titre('1. Premier lancement du jour : l\'Accueil');
await page.setViewportSize({ width: 390, height: 844 });
await N.ouvrirConnecte('livreur.html', LIVREUR); await vieillir();
await N.ouvrirConnecte('livreur.html', LIVREUR); await dodo(3000);
verifier('l\'application s\'ouvre sur l\'Accueil', await page.locator('#panel-accueil').isVisible() && (await actif()) === 'accueil', await actif());
verifier('« Bonjour Koffi » (ou « Bonsoir »)', /^(Bonjour|Bonsoir) Koffi/.test(await txt('#panel-accueil .ac-bonjour')), await txt('#panel-accueil .ac-bonjour'));
verifier('la phrase du jour', /^Aujourd'hui : /.test(await txt('#panel-accueil .ac-phrase')), await txt('#panel-accueil .ac-phrase'));
verifier('quatre chiffres : à livrer, livrés, non livrés, en main', (await page.locator('#panel-accueil .ac-chiffre-l').allInnerTexts()).join('|') === 'à livrer|livrés|non livrés|en main');
const cols = await page.locator('#panel-accueil .rc-col-tete strong').allInnerTexts();
verifier('trois colonnes : Ma journée, Mon argent, Moi et CLT', cols.join('|') === 'Ma journée|Mon argent|Moi et CLT', cols.join('|'));
verifier('« Colis du jour » porte son nombre', /à livrer|Rien à livrer/.test(await txt('[data-acl="du-jour"] .rc-etat')), await txt('[data-acl="du-jour"] .rc-etat'));
verifier('« Argent en main » porte le montant', /F en main|Rien en main/.test(await txt('[data-acl="en-main"] .rc-etat')), await txt('[data-acl="en-main"] .rc-etat'));
verifier('la carte « Ma journée » du haut s\'efface sur l\'Accueil (pas deux fois la même chose)', await page.locator('#ma-journee-card').isHidden());
verifier('téléphone : cases ≥ 44 px, rien ne déborde', await page.evaluate(() => { const c = [...document.querySelectorAll('#panel-accueil .rc-case')]; return c.length === 10 && c.every((e) => e.getBoundingClientRect().height >= 44) && document.documentElement.scrollWidth <= innerWidth + 1; }));
verifier('la barre du bas : Accueil en premier, rien ne se chevauche', await page.evaluate(() => { const b = [...document.querySelectorAll('#clt-bottomnav > .nav')]; const r = b.map((x) => x.getBoundingClientRect()); return b[0].dataset.nav === 'accueil' && r.every((x, i) => i === 0 || x.left >= r[i - 1].right - 1); }));
verifier('clair : contraste ≥ 4,5', (await contraste()) === '', await contraste());
if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/accueil-livreur-390.png', fullPage: true });

titre('2. Chaque case mène à son écran');
await page.locator('[data-acl="du-jour"]').click(); await dodo(900);
verifier('« Colis du jour » : Mes colis, sur « Ma journée »', await page.locator('#panel-mes').isVisible() && /Ma journée/.test(await txt('#filters-mes .filter-chip.active')), await txt('#filters-mes .filter-chip.active'));
await page.goBack(); await dodo(900);
verifier('« retour » ramène à l\'Accueil', await page.locator('#panel-accueil').isVisible(), await actif());
await page.locator('[data-acl="a-rendre"]').click(); await dodo(900);
verifier('« À rendre » : Mes colis, sur « À rendre »', await page.locator('#panel-mes').isVisible() && /À rendre/.test(await txt('#filters-mes .filter-chip.active')) && (await actif()) === 'retours', (await actif()) + ' ' + await txt('#filters-mes .filter-chip.active'));
await page.goBack(); await dodo(900);
await page.locator('[data-acl="en-main"]').click(); await dodo(1200);
verifier('« Argent en main » : Finance', await page.locator('#panel-finance').isVisible() && (await actif()) === 'finance');
await page.goBack(); await dodo(900);
await page.locator('[data-acl="recup"]').click(); await dodo(900);
verifier('« Récupérations » : l\'onglet Récupérations', await page.locator('#panel-recup').isVisible());
await page.goBack(); await dodo(900);
await page.locator('[data-acl="dossier"]').click(); await dodo(1200);
verifier('« Mon dossier CLT » s\'ouvre', /dossier/i.test(await page.evaluate(() => [...document.querySelectorAll('[role="dialog"], .modal-overlay, .clt-modal, [data-clt-couche]')].filter((e) => getComputedStyle(e).display !== 'none' && !e.classList.contains('hidden')).map((e) => e.innerText).join(' '))));
await page.keyboard.press('Escape'); await dodo(500);

titre('3. Revenir : il retrouve son écran, sauf après une pause');
await page.evaluate(() => showTab('recup')); await dodo(400);
await N.ouvrirConnecte('livreur.html', LIVREUR); await dodo(2500);
verifier('rouvert tout de suite : Récupérations (là où il était)', await page.locator('#panel-recup').isVisible(), await actif());
await page.evaluate(() => { localStorage.setItem('clt:livreur:derniere-activite', String(Date.now() - 45 * 60000)); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
await dodo(1000);
verifier('revenue au premier plan après 45 minutes : l\'Accueil', await page.locator('#panel-accueil').isVisible(), await actif());

titre('4. Ordinateur, nuit, largeurs');
await vieillir();
await page.setViewportSize({ width: 1440, height: 900 });
await N.ouvrirConnecte('livreur.html', LIVREUR); await dodo(3000);
const tops = await page.locator('#panel-accueil .rc-col').evaluateAll((l) => l.map((e) => Math.round(e.getBoundingClientRect().top)));
verifier('ordinateur : Ma journée et Mon argent côte à côte, Moi et CLT en bandeau dessous', tops.length === 3 && tops[0] === tops[1] && tops[2] > tops[0], tops.join(','));
verifier('aucun texte ne sort de sa case', await page.evaluate(() => [...document.querySelectorAll('#panel-accueil .rc-case')].every((c) => c.scrollWidth <= c.clientWidth + 1)));
verifier('« 🏠 Accueil » en tête des onglets du haut', /Accueil/.test(await txt('.clt-toptabs .clt-toptab')));
if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/accueil-livreur-1440.png' });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await dodo(300);
verifier('nuit : contraste ≥ 4,5', (await contraste()) === '', await contraste());
if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/accueil-livreur-1440-nuit.png' });
for (const w of [320, 768]) {
  await page.setViewportSize({ width: w, height: 800 }); await dodo(400);
  verifier(`à ${w} px : rien ne déborde`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/accueil-livreur-' + w + '-nuit.png' });
}

verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
await N.fermer();
process.exit(bilan() ? 1 : 0);
