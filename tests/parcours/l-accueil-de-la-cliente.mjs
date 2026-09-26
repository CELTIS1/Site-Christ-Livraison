/* PARCOURS — L'ACCUEIL DE LA CLIENTE ET DU PROPRIÉTAIRE (26 septembre 2026, lot AC, v294)
     1. Premier lancement du jour : l'Accueil — « Bonjour », la phrase du jour, quatre chiffres, trois colonnes ;
        « Faire passer un livreur » en premier, en toutes lettres ;
     2. chaque case mène à son écran ; le « retour » ramène à l'Accueil ;
     3. le propriétaire : une colonne « Mes boutiques », une case par boutique, qui ouvre cette boutique ;
     4. rouvert tout de suite : son écran ; téléphone et ordinateur, clair et nuit ; zéro erreur.
   Lancer à la main :  node tests/parcours/l-accueil-de-la-cliente.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, CLIENTE1, CLIENTE2 } from './_monde.mjs';

const monde = nouveauMonde();
const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const txt = async (sel) => ((await page.locator(sel).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const vieillir = () => page.evaluate(() => localStorage.setItem('test:vieillir', '1'));
const visible = (id) => page.locator('#' + id).isVisible();
const contraste = () => page.evaluate(() => {
  const lum = (s) => { const m = s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
  const fond = (el) => { while (el) { const b = getComputedStyle(el).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; el = el.parentElement; } return 'rgb(255,255,255)'; };
  return [...document.querySelectorAll('#section-accueil .ac-bonjour, #section-accueil .ac-phrase, #section-accueil .ac-chiffre-n, #section-accueil .ac-chiffre-l, #section-accueil .rc-etat, #section-accueil .rc-case-txt small, #section-accueil .rc-case-txt strong, #section-accueil .rc-col-tete strong')].filter((el) => { const a = lum(getComputedStyle(el).color), b = lum(fond(el)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 4.5; }).map((e) => e.className + ':' + e.textContent.slice(0, 20)).join(' | ');
});

titre('1. Premier lancement du jour : l\'Accueil');
await page.setViewportSize({ width: 390, height: 844 });
await N.ouvrirConnecte('fournisseur.html', CLIENTE1); await vieillir();
await N.ouvrirConnecte('fournisseur.html', CLIENTE1); await dodo(3000);
verifier('l\'application s\'ouvre sur l\'Accueil', await visible('section-accueil') && !(await visible('section-ajouter')));
verifier('« Bonjour Awa » (ou « Bonsoir »)', /^(Bonjour|Bonsoir) Awa/.test(await txt('#section-accueil .ac-bonjour')), await txt('#section-accueil .ac-bonjour'));
verifier('la phrase du jour', /^(Aujourd'hui : |Voici)/.test(await txt('#section-accueil .ac-phrase')), await txt('#section-accueil .ac-phrase'));
verifier('quatre chiffres : confiés, livrés, en route, CLT me doit', (await page.locator('#section-accueil .ac-chiffre-l').allInnerTexts()).join('|').replace(/je dois.*/, 'CLT me doit') === 'confiés aujourd\'hui|livrés|en route|CLT me doit', (await page.locator('#section-accueil .ac-chiffre-l').allInnerTexts()).join('|'));
const cols = await page.locator('#section-accueil .rc-col-tete strong').allInnerTexts();
verifier('trois colonnes : Mes colis, Mon argent, Retours et aide', cols.join('|') === 'Mes colis|Mon argent|Retours et aide', cols.join('|'));
verifier('la première case dit clairement : « Faire passer un livreur — Nous venons chercher vos colis »', /Faire passer un livreur/.test(await txt('#section-accueil .rc-case')) && /Nous venons chercher vos colis/.test(await txt('#section-accueil .rc-case')));
verifier('« Ce que CLT me doit » porte le montant', /à recevoir|Tout est reversé|Vous devez/.test(await txt('[data-acf="me-doit"] .rc-etat')), await txt('[data-acf="me-doit"] .rc-etat'));
verifier('clair : contraste ≥ 4,5', (await contraste()) === '', await contraste());
verifier('téléphone : cases ≥ 44 px, rien ne déborde', await page.evaluate(() => { const c = [...document.querySelectorAll('#section-accueil .rc-case')]; return c.length === 10 && c.every((e) => e.getBoundingClientRect().height >= 44) && document.documentElement.scrollWidth <= innerWidth + 1; }));
if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/accueil-cliente-390.png', fullPage: true });

titre('2. Chaque case mène à son écran');
await page.locator('[data-acf="passage"]').click(); await dodo(900);
verifier('« Faire passer un livreur » : la carte « Demander un passage »', await visible('section-passage') && await page.locator('#passage-envoyer').isVisible());
await page.goBack(); await dodo(900);
verifier('« retour » ramène à l\'Accueil', await visible('section-accueil'));
await page.locator('[data-acf="du-jour"]').click(); await dodo(900);
verifier('« Mes colis d\'aujourd\'hui » : Mes colis, sur le jour', await visible('section-colis') && (await page.inputValue('#filtre-date-colis')) === (await page.evaluate(() => todayLocalISODate())));
await page.goBack(); await dodo(900);
await page.locator('[data-acf="me-doit"]').click(); await dodo(900);
verifier('« Ce que CLT me doit » : Récap, le relevé ouvert', await visible('section-releve') && await page.evaluate(() => document.getElementById('releve-details').open));
await page.goBack(); await dodo(900);
await page.locator('[data-acf="retours"]').click(); await dodo(900);
verifier('« Mes retours » : l\'onglet Retours', await visible('section-retours'));
await page.goBack(); await dodo(900);

titre('3. Le propriétaire : ses boutiques');
monde.TABLES.boutiques_supervisees.push({ superviseur_id: CLIENTE1, fournisseur_id: CLIENTE2, cree_le: new Date().toISOString() });
await vieillir();
await N.ouvrirConnecte('fournisseur.html', CLIENTE1); await dodo(3500);
const cols2 = await page.locator('#section-accueil .rc-col-tete strong').allInnerTexts();
verifier('une quatrième colonne « Mes boutiques »', cols2.includes('Mes boutiques'), cols2.join('|'));
verifier('« Toutes mes boutiques », puis une case par boutique (Mariam Mode)', /Toutes mes boutiques/.test(await txt('.rc-col--boutiques')) && /Mariam Mode/.test(await txt('.rc-col--boutiques')), await txt('.rc-col--boutiques'));
await page.locator(`[data-acf="mb:${CLIENTE2}"]`).click(); await dodo(1200);
verifier('la case ouvre cette boutique', await visible('section-mes-boutiques') && /Mariam Mode/.test(await txt('#mb-titre')), await txt('#mb-titre'));
await page.goBack(); await dodo(900);
if (process.env.CAPTURES) { await page.setViewportSize({ width: 1440, height: 900 }); await dodo(500); await page.screenshot({ path: process.env.CAPTURES + '/accueil-proprietaire-1440.png' }); await page.setViewportSize({ width: 390, height: 844 }); }

titre('4. Revenir, largeurs, nuit');
await page.evaluate(() => showFournisseurTab('section-recap')); await dodo(300);
await N.ouvrirConnecte('fournisseur.html', CLIENTE1); await dodo(2500);
verifier('rouvert tout de suite : son écran (Récap)', await visible('section-recap') && !(await visible('section-accueil')));
await page.evaluate(() => { localStorage.setItem('clt:cliente:derniere-activite', String(Date.now() - 45 * 60000)); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
await dodo(800);
verifier('revenue au premier plan après 45 minutes : l\'Accueil', await visible('section-accueil'));
await page.setViewportSize({ width: 1440, height: 900 }); await dodo(400);
const tops = await page.locator('#section-accueil .rc-col').evaluateAll((l) => l.map((e) => Math.round(e.getBoundingClientRect().top)));
verifier('ordinateur : colonnes rangées (deux par ligne pour un propriétaire)', tops.length === 4 && tops[0] === tops[1] && tops[2] === tops[3], tops.join(','));
{ const m = await page.evaluate(() => { const b = document.querySelector('.clt-toptabs'); const r = b.getBoundingClientRect(); return { r: Math.round(r.right), w: Math.round(r.width), t: [...b.querySelectorAll('.clt-toptab:not(.hidden)')].map((t) => Math.round(t.getBoundingClientRect().right) + ':' + t.scrollWidth + '/' + t.clientWidth) }; }); verifier('les six onglets du haut tiennent dans la barre', m.t.every((x) => Number(x.split(':')[0]) <= m.r + 1), JSON.stringify(m)); }
verifier('aucun texte ne sort de sa case', await page.evaluate(() => [...document.querySelectorAll('#section-accueil .rc-case')].every((c) => c.scrollWidth <= c.clientWidth + 1)));
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await dodo(300);
verifier('nuit : contraste ≥ 4,5', (await contraste()) === '', await contraste());
if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/accueil-cliente-1440-nuit.png' });
for (const w of [320, 768]) {
  await page.setViewportSize({ width: w, height: 800 }); await dodo(400);
  verifier(`à ${w} px : rien ne déborde, la barre du bas tient`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#clt-bottomnav > .nav')].filter((x) => getComputedStyle(x).display !== 'none').every((x) => x.scrollWidth <= x.clientWidth + 2)));
  if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/accueil-cliente-' + w + '-nuit.png' });
}

verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
await N.fermer();
process.exit(bilan() ? 1 : 0);
