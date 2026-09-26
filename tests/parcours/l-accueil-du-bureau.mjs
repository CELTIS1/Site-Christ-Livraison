/* PARCOURS — L'ACCUEIL DU BUREAU (26 septembre 2026, lot AC, v292)
     1. Premier lancement du jour : l'application s'ouvre sur l'Accueil — « Bonjour », la phrase du jour,
        les quatre chiffres, quatre colonnes par thème ;
     2. chaque case mène à son écran (onglet, vue de l'Argent, page de Gestion) ; « retour » ramène à l'Accueil ;
     3. rouvert cinq minutes plus tard : on retrouve l'écran où l'on était ; après une longue pause : l'Accueil ;
     4. téléphone et ordinateur, clair et nuit ; zéro erreur.
   Lancer à la main :  node tests/parcours/l-accueil-du-bureau.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, ADMIN } from './_monde.mjs';

const monde = nouveauMonde();
const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const txt = async (sel) => ((await page.locator(sel).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const ongletActif = async () => page.evaluate(() => (document.querySelector('#clt-toptabs .clt-toptab.active') || {}).dataset?.eqtab || '');
const premierLancementDuJour = () => page.evaluate(() => localStorage.setItem('test:vieillir', '1'));

titre('1. Premier lancement du jour : l\'Accueil');
await page.setViewportSize({ width: 390, height: 844 });
await N.ouvrirConnecte('equipe.html', ADMIN); await premierLancementDuJour();
await N.ouvrirConnecte('equipe.html', ADMIN); await dodo(3000);
verifier('l\'application s\'ouvre sur l\'Accueil', await page.locator('#eqpanel-accueil').isVisible() && (await ongletActif()) === 'accueil', await ongletActif());
verifier('« Bonjour » (ou « Bonsoir ») et le prénom', /^(Bonjour|Bonsoir) /.test(await txt('.ac-bonjour')), await txt('.ac-bonjour'));
verifier('la phrase du jour résume la journée', /Aujourd'hui : .*reçus?/.test(await txt('.ac-phrase')), await txt('.ac-phrase'));
verifier('les quatre chiffres du jour : reçus, livrés, échecs, en cours', (await page.locator('.ac-chiffre').count()) === 4);
const cols = await page.locator('#eqpanel-accueil .rc-col-tete strong').allInnerTexts();
verifier('quatre colonnes : Colis, Les points du jour, Argent, Équipe et comptes', cols.join('|') === 'Colis|Les points du jour|Argent|Équipe et comptes', cols.join('|'));
verifier('les cases portent leurs nombres (à confier, en cours…)', /colis sans livreur|Tout est confié/.test(await txt('[data-ac="a-confier"] .rc-etat')) && /en cours/.test(await txt('[data-ac="recensement"] .rc-etat')), await txt('[data-ac="a-confier"] .rc-etat'));
await dodo(2500);
verifier('« À traiter » : un état lu', /Rien à faire|urgent/.test(await txt('[data-ac="a-traiter"] .rc-etat')), await txt('[data-ac="a-traiter"] .rc-etat'));
verifier('téléphone : cases ≥ 44 px, rien ne déborde', await page.evaluate(() => { const c = [...document.querySelectorAll('#eqpanel-accueil .rc-case')]; return c.length >= 12 && c.every((e) => e.getBoundingClientRect().height >= 44) && document.documentElement.scrollWidth <= innerWidth + 1; }));
verifier('la barre du bas porte « Accueil », et rien ne se chevauche', await page.evaluate(() => { const b = [...document.querySelectorAll('#clt-bottomnav > .nav:not(.nav--dans-plus)')].filter((x) => getComputedStyle(x).display !== 'none'); const r = b.map((x) => x.getBoundingClientRect()); return b[0].dataset.nav === 'accueil' && r.every((x, i) => i === 0 || x.left >= r[i - 1].right - 1) && b.every((x) => x.scrollHeight <= x.clientHeight + 2); }));
if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/accueil-390.png', fullPage: true });

titre('2. Chaque case mène à son écran');
await page.locator('[data-ac="point-livreurs"]').click(); await dodo(1500);
verifier('« Point des livreurs » : Argent › Remise du livreur', (await ongletActif()) === 'finances' && await page.locator('#argent-vue-remise').isVisible());
await page.goBack(); await dodo(1200);
verifier('« retour » ramène à l\'Accueil', (await ongletActif()) === 'accueil', await ongletActif());
await page.locator('[data-ac="point-vendeurs"]').click(); await dodo(1500);
verifier('« Point des vendeurs » : Argent › Reversement', (await ongletActif()) === 'finances' && await page.locator('#argent-vue-reversement').isVisible());
await page.goBack(); await dodo(1000);
await page.locator('[data-ac="tournees"]').click(); await dodo(1200);
verifier('« Tournées » : l\'onglet des tournées', (await ongletActif()) === 'programmation');
await page.goBack(); await dodo(1000);
await page.locator('[data-ac="carburant"]').click(); await dodo(5000);
verifier('« Carburant du jour » : le Bureau, sur Paie › Carburant', (await ongletActif()) === 'bureau' && await page.frameLocator('#bureau-cadre-hote iframe').locator('#paie-carburant').isVisible().catch(() => false));

titre('3. Revenir : on reste, sauf après une pause');
await page.evaluate(() => showEquipeTab('suivi')); await dodo(500);
await N.ouvrirConnecte('equipe.html', ADMIN); await dodo(2500);
verifier('rouvert tout de suite : on retrouve l\'écran où l\'on était (Suivi)', (await ongletActif()) === 'suivi', await ongletActif());
// L'application revient au premier plan après 45 minutes (téléphone posé, application restée ouverte).
await page.evaluate(() => { localStorage.setItem('clt:equipe:derniere-activite', String(Date.now() - 45 * 60000)); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
await dodo(1200);
verifier('revenue au premier plan après 45 minutes : l\'Accueil', (await ongletActif()) === 'accueil', await ongletActif());
// Rouverte (rechargée) le lendemain : l'Accueil.
await page.evaluate(() => showEquipeTab('suivi'));
await page.evaluate(() => localStorage.setItem('test:vieillir', '1'));
await N.ouvrirConnecte('equipe.html', ADMIN); await dodo(2500);
verifier('rouverte le lendemain : l\'Accueil', (await ongletActif()) === 'accueil', await ongletActif());
await N.ouvrirConnecte('equipe.html?onglet=personnes', ADMIN); await dodo(2000);
verifier('un lien précis passe avant l\'accueil', (await ongletActif()) === 'personnes', await ongletActif());

titre('4. Ordinateur, nuit, largeurs');
await page.evaluate(() => localStorage.setItem('test:vieillir', '1'));
await page.setViewportSize({ width: 1440, height: 900 });
await N.ouvrirConnecte('equipe.html', ADMIN); await dodo(3000);
const tops = await page.locator('#eqpanel-accueil .rc-col').evaluateAll((l) => l.map((e) => Math.round(e.getBoundingClientRect().top)));
verifier('ordinateur : les quatre colonnes côte à côte', tops.length === 4 && new Set(tops).size === 1, tops.join(','));
verifier('« 🏠 Accueil » en tête des onglets du haut', (await txt('#clt-toptabs .clt-toptab')).includes('Accueil'));
if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/accueil-1440.png' });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await dodo(300);
if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/accueil-1440-nuit.png' });
verifier('nuit : contraste ≥ 4,5 sur les titres, les chiffres et les pastilles', await page.evaluate(() => {
  const lum = (s) => { const m = s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
  const fond = (el) => { while (el) { const b = getComputedStyle(el).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; el = el.parentElement; } return 'rgb(255,255,255)'; };
  const ok = (el) => { const a = lum(getComputedStyle(el).color), b = lum(fond(el)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5; };
  return [...document.querySelectorAll('.ac-bonjour, .ac-phrase, .ac-chiffre-n, .ac-chiffre-l, #eqpanel-accueil .rc-etat, #eqpanel-accueil .rc-case-txt strong, #eqpanel-accueil .rc-case-txt small, #eqpanel-accueil .rc-col-tete strong')].every(ok);
}));
for (const w of [320, 768]) {
  await page.setViewportSize({ width: w, height: 800 }); await dodo(400);
  verifier(`à ${w} px : rien ne déborde, la barre du bas tient`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#clt-bottomnav > .nav')].filter((x) => getComputedStyle(x).display !== 'none').every((x) => x.scrollWidth <= x.clientWidth + 2)));
  if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/accueil-' + w + '-nuit.png' });
}
await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
await page.setViewportSize({ width: 390, height: 844 }); await dodo(300);
verifier('clair : contraste ≥ 4,5', await page.evaluate(() => {
  const lum = (s) => { const m = s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
  const fond = (el) => { while (el) { const b = getComputedStyle(el).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; el = el.parentElement; } return 'rgb(255,255,255)'; };
  const ok = (el) => { const a = lum(getComputedStyle(el).color), b = lum(fond(el)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5; };
  return [...document.querySelectorAll('.ac-bonjour, .ac-phrase, .ac-chiffre-n, .ac-chiffre-l, #eqpanel-accueil .rc-etat, #eqpanel-accueil .rc-case-txt small, #eqpanel-accueil .rc-col-tete strong')].every(ok);
}));

verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
await N.fermer();
process.exit(bilan() ? 1 : 0);
