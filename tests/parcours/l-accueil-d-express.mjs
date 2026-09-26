/* PARCOURS — L'ACCUEIL DE CLT EXPRESS (26 septembre 2026, lot AC, v295)
     Comme Uber, Yango et Uber Driver : le premier écran reste le geste principal (commander ; être
     disponible), et la synthèse se pose en tête — « Bonjour », une phrase, trois cases.
     1. Client sans course : « Où livrons-nous aujourd'hui ? », Mes courses, Mon compte ; le formulaire reste dessous ;
     2. une course en cours : la phrase la dit, la case « Ma course en cours » mène à sa carte ;
     3. coursier : sa course en cours, son solde (« à recharger » sous le minimum), son compte ;
     4. largeurs, nuit, contraste ; zéro erreur.
   Lancer à la main :  node tests/parcours/l-accueil-d-express.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, CLIENT_EXPRESS, iso } from './_monde.mjs';

const COURSIER = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const monde = nouveauMonde();
monde.PROFILS.push({ id: COURSIER, full_name: 'Sery Coursier', role: 'coursier_express', phone: '2250700000031', status: 'valide', company_name: null, avatar_url: null, disponible_express: true, suppression_demandee_at: null, geoloc_consent_at: iso(-3), telephone_verifie_at: iso(-10) });
Object.assign(monde.TABLES.express_config[0], { solde_minimum: 1500, rayon_dispatch_km: 3, commission_pct: 0.15 });
monde.TABLES.express_wallets = [{ coursier_id: COURSIER, solde: 1000 }];

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const txt = async (sel) => ((await page.locator(sel).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const contraste = () => page.evaluate(() => {
  const lum = (s) => { const m = s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
  const fond = (el) => { while (el) { const b = getComputedStyle(el).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; el = el.parentElement; } return 'rgb(255,255,255)'; };
  return [...document.querySelectorAll('#ex-accueil .ac-bonjour, #ex-accueil .ac-phrase, #ex-accueil .rc-etat, #ex-accueil .rc-case-txt small, #ex-accueil .rc-case-txt strong')].filter((el) => { const a = lum(getComputedStyle(el).color), b = lum(fond(el)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 4.5; }).map((e) => e.className + ':' + e.textContent.slice(0, 20) + ' ' + getComputedStyle(e).color + ' / ' + fond(e)).join(' | ');
});

titre('1. Le client, sans course');
await page.setViewportSize({ width: 390, height: 844 });
await N.ouvrirConnecte('express-client.html', CLIENT_EXPRESS); await dodo(2500);
verifier('« Bonjour Yao » en tête de « Nouvelle course »', await page.locator('#section-nouvelle #ex-accueil').isVisible() && /^(Bonjour|Bonsoir) Yao/.test(await txt('#ex-accueil .ac-bonjour')), await txt('#ex-accueil .ac-bonjour'));
verifier('« Où livrons-nous aujourd\'hui ? »', (await txt('#ex-accueil .ac-phrase')) === 'Où livrons-nous aujourd\'hui ?', await txt('#ex-accueil .ac-phrase'));
verifier('deux cases : Mes courses, Mon compte (pas de « course en cours » quand il n\'y en a pas)', (await page.locator('#ex-accueil .rc-case strong').allInnerTexts()).join('|') === 'Mes courses|Mon compte');
verifier('le formulaire de commande est juste dessous, toujours là', await page.locator('#form-new-course').isVisible());
verifier('clair : contraste ≥ 4,5', (await contraste()) === '', await contraste());
if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/accueil-express-client-390.png' });

titre('2. Une course en cours');
monde.TABLES.express_courses.push({ id: 'eeee0000-0000-4000-8000-000000000001', client_id: CLIENT_EXPRESS, status: 'acceptee', coursier_id: COURSIER, created_at: new Date().toISOString(), accepted_at: new Date().toISOString(), prix_total: 1500, commission_montant: 225, montant_coursier: 1275, commune_recuperation: 'Adjamé', adresse_recuperation: 'Marché', commune_livraison: 'Cocody', adresse_livraison: 'Riviera', destinataire_nom: 'Koffi', destinataire_telephone: '0701020304', description: 'Une enveloppe', paiement_mode: 'especes' });
await N.ouvrirConnecte('express-client.html', CLIENT_EXPRESS); await dodo(2500);
verifier('la phrase dit où en est la course', /un coursier arrive/.test(await txt('#ex-accueil .ac-phrase')), await txt('#ex-accueil .ac-phrase'));
verifier('« Ma course en cours » est la première case, avec son état', /Ma course en cours/.test(await txt('#ex-accueil .rc-case')) && /Un coursier arrive/.test(await txt('#ex-accueil .rc-case .rc-etat')));
await page.locator('[data-acx="en-cours"]').click(); await dodo(1200);
verifier('elle mène à « Mes courses », sur la course', await page.locator('#section-courses').isVisible() && await page.locator('#section-courses .course-item').first().isVisible());

titre('3. Le coursier');
await N.ouvrirConnecte('express-coursier.html', COURSIER); await dodo(3000);
verifier('« Bonjour Sery » en tête de « Dispo », au-dessus de « Je suis disponible »', await page.locator('#cpanel-dispo #ex-accueil').isVisible() && await page.evaluate(() => document.getElementById('ex-accueil').getBoundingClientRect().top < document.getElementById('card-availability').getBoundingClientRect().top) && /^(Bonjour|Bonsoir) Sery/.test(await txt('#ex-accueil .ac-bonjour')), await txt('#ex-accueil .ac-bonjour'));
verifier('la phrase : la course en cours et le solde', /course en cours/i.test(await txt('#ex-accueil .ac-phrase')) && /solde 1 000 F/.test(await txt('#ex-accueil .ac-phrase')), await txt('#ex-accueil .ac-phrase'));
verifier('« Mon solde » : 1 000 F — à recharger (minimum 1 500 F)', /1 000 F — à recharger/.test(await txt('[data-acx="solde"] .rc-etat')), await txt('[data-acx="solde"] .rc-etat'));
await page.locator('[data-acx="solde"]').click(); await dodo(900);
verifier('« Mon solde » ouvre l\'onglet Solde', await page.locator('#section-recharges').isVisible());
await page.goBack(); await dodo(900);
verifier('« retour » : de nouveau « Dispo » et l\'accueil en tête', await page.locator('#cpanel-dispo #ex-accueil').isVisible());
verifier('la course du coursier se dit de son côté : « À récupérer »', /À récupérer/.test(await txt('[data-acx="en-cours"] .rc-etat')), await txt('[data-acx="en-cours"] .rc-etat'));
verifier('téléphone : cases ≥ 44 px, rien ne déborde', await page.evaluate(() => [...document.querySelectorAll('#ex-accueil .rc-case')].every((e) => e.getBoundingClientRect().height >= 44) && document.documentElement.scrollWidth <= innerWidth + 1));
if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/accueil-express-coursier-390.png' });
await page.locator('#clt-bottomnav .nav[data-target="section-mescourses"]').click(); await dodo(500);
verifier('sur « Mes courses », l\'accueil n\'est pas répété', !(await page.locator('#ex-accueil').isVisible()));

titre('4. Largeurs et nuit');
await page.locator('#clt-bottomnav .nav[data-target="section-disponibles"]').click(); await dodo(500);
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await dodo(300);
verifier('nuit : contraste ≥ 4,5', (await contraste()) === '', await contraste());
for (const w of [320, 768, 1440]) {
  await page.setViewportSize({ width: w, height: 800 }); await dodo(400);
  verifier(`à ${w} px : rien ne déborde, aucun texte ne sort de sa case`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#ex-accueil .rc-case')].every((c) => c.scrollWidth <= c.clientWidth + 1)));
  if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/accueil-express-coursier-' + w + '-nuit.png' });
}

verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
await N.fermer();
process.exit(bilan() ? 1 : 0);
