/* PARCOURS 1 — LA CONNEXION DU LIVREUR (feuille de route 4.10, 16 septembre 2026)
   ==========================================================================================
   Koffi ouvre l'app sur son téléphone, tape son numéro et son mot de passe, arrive sur son
   écran. Puis : un mauvais mot de passe est refusé avec un message clair, et la session d'un
   livreur reste mémorisée (localStorage) — une vraie application, pas un site.
   ========================================================================================== */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { LIVREUR } from './_monde.mjs';

const N = await ouvrirNavigateur();
const { page, base, monde, erreurs } = N;

titre('1. La page de connexion s\'ouvre, propre');
await page.goto(base + '/app/login.html', { waitUntil: 'load' });
await dodo(800);
verifier('le formulaire est là : numéro, mot de passe, « Se connecter »', await page.locator('#login-phone').isVisible() && await page.locator('#login-password').isVisible() && await page.locator('#btn-login-submit').isVisible());
verifier('« Quoi de neuf dans l\'application ? » est proposé sur la connexion', await page.locator('#btn-nouveautes').isVisible());
verifier('aucune erreur JavaScript au chargement', erreurs.length === 0, erreurs.join('\n       '));

titre('2. Un mauvais mot de passe est refusé, sans casser la page');
await page.fill('#login-phone', '07 00 00 00 01');
await page.fill('#login-password', 'pas-le-bon');
await page.click('#btn-login-submit');
await dodo(1200);
const tentative = monde.journal.find(j => j.op === 'connexion');
verifier('la page a envoyé le numéro au format 225… (sans espaces)', tentative && tentative.phone === '2250700000001', JSON.stringify(tentative));
verifier('la base a dit non', tentative && tentative.ok === false);
verifier('le message « numéro ou mot de passe incorrect » s\'affiche', /incorrect/i.test(await page.locator('body').innerText()));
verifier('on est toujours sur la connexion, le bouton est redevenu cliquable', /login\.html/.test(page.url()) && !(await page.locator('#btn-login-submit').isDisabled()));

titre('3. Le bon mot de passe ouvre l\'espace du livreur');
await page.fill('#login-password', 'koffi-2026');
await Promise.all([
  page.waitForURL(/livreur\.html/, { timeout: 15000 }).catch(() => null),
  page.click('#btn-login-submit'),
]);
await dodo(2000);
verifier('la page a redirigé vers livreur.html', /livreur\.html/.test(page.url()), page.url());
const session = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('clt-faux-session')); } catch (e) { return null; } });
verifier('la session est mémorisée dans localStorage (le livreur reste connecté)', session && session.user && session.user.id === LIVREUR);
verifier('la page du livreur est chargée avec ses colis (liste #mes-colis-list)', await page.locator('#mes-colis-list').count() === 1 && (await page.locator('#mes-colis-list .colis-item').count()) >= 1, await page.locator('#mes-colis-list .colis-item').count());
verifier('son nom est à l\'écran', /Koffi/.test(await page.locator('body').innerText()));
verifier('aucune erreur JavaScript pendant la connexion et l\'ouverture', erreurs.length === 0, erreurs.join('\n       '));

titre('4. Fermer et rouvrir : il est toujours connecté');
await page.goto(base + '/app/livreur.html', { waitUntil: 'load' });
await dodo(1500);
verifier('livreur.html s\'ouvre directement, sans repasser par la connexion', /livreur\.html/.test(page.url()) && (await page.locator('#mes-colis-list .colis-item').count()) >= 1, page.url());
await page.goto(base + '/app/login.html', { waitUntil: 'load' });
await dodo(1500);
verifier('login.html renvoie tout seul un livreur déjà connecté vers son espace', /livreur\.html/.test(page.url()), page.url());

await N.fermer();
process.exit(bilan() ? 1 : 0);
