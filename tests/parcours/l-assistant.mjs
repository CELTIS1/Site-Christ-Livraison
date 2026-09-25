/* PARCOURS — L'ASSISTANT (chantier Q, 25 septembre 2026)
   ==========================================================================================
   Le bouton « casque » dans chaque espace : le client Express demande où est sa course et le
   code ; le coursier son solde ; la cliente ce que CLT lui doit ; le livreur sa journée ; l'équipe
   ce qui attend. Une question d'aide ouvre la fiche ; « parler à quelqu'un » prépare WhatsApp
   avec le nom. Téléphone la nuit à la fin.

   Lancer à la main :  node tests/parcours/l-assistant.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, iso, colis, ADMIN, LIVREUR, CLIENTE1, CLIENT_EXPRESS } from './_monde.mjs';

const COURSIER = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const monde = nouveauMonde();
monde.PROFILS.push({ id: COURSIER, full_name: 'Sery Coursier', role: 'coursier_express', phone: '2250700000031', status: 'valide', company_name: null, avatar_url: null, disponible_express: true, suppression_demandee_at: null, geoloc_consent_at: iso(-3), telephone_verifie_at: iso(-10) });
(monde.TABLES.express_wallets ||= []).push({ coursier_id: COURSIER, solde: 1350 });
monde.TABLES.express_config[0].solde_minimum = 500;
monde.TABLES.express_courses.push({ id: 'c-a', client_id: CLIENT_EXPRESS, coursier_id: COURSIER, status: 'recuperee', adresse_recuperation: 'Adjamé — Marché', adresse_livraison: 'Cocody — Riviera 3', description_colis: 'Un carton', created_at: iso(0, 8), accepted_at: iso(0, 8), recuperee_at: iso(0, 9), prix_total: 1216, commission_montant: 182, montant_coursier: 1034, distance_km: 4.8 });
monde.TABLES.express_codes_livraison.push({ course_id: 'c-a', code: '0472', created_at: iso(0, 8) });
monde.TABLES.colis.push(colis(400, { statut: 'livre', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, created_at: iso(0, 7), recupere_at: iso(0, 8), livre_at: iso(0, 10), montant_article: 15000, montant_livraison: 2000 }));
monde.TABLES.colis.push(colis(401, { statut: 'en_livraison', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, created_at: iso(0, 7), recupere_at: iso(0, 8), en_livraison_at: iso(0, 9), montant_article: 8000, montant_livraison: 1500 }));

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texteDe = (sel) => page.evaluate((q) => { const e = document.querySelector(q); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
const ouvrirAssistant = async () => { for (let i = 0; i < 10 && !(await page.evaluate(() => !!document.getElementById('clt-assistant-bouton'))); i++) await dodo(300); await page.evaluate(() => { const b = document.getElementById('clt-assistant-bouton'); if (b) b.click(); }); await dodo(600); };
const demander = async (q) => { const ok = await page.evaluate((v) => { const c = document.getElementById('clt-assistant-champ'); if (!c) return false; c.value = v; document.getElementById('clt-assistant-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); return true; }, q); if (!ok) return '(pas de champ : ' + JSON.stringify(await page.evaluate(() => ({ f: !!document.getElementById('clt-assistant'), b: !!document.getElementById('clt-assistant-bouton') }))) + ')'; await dodo(1500); return texteDe('#clt-assistant-fil .clt-assistant__bulle--clt:last-child'); };

titre('1. Le client Express : où est ma course, le code, une fiche, un humain');
await N.ouvrirConnecte('express-client.html', CLIENT_EXPRESS);
await dodo(1800);
const b = await page.evaluate(() => { const e = document.getElementById('clt-assistant-bouton'); if (!e) return null; const r = e.getBoundingClientRect(); const nav = document.getElementById('clt-bottomnav'); const n = nav ? nav.getBoundingClientRect() : null; return { w: Math.round(r.width), bas: Math.round(window.innerHeight - r.bottom), audessus: n ? r.bottom <= n.top + 1 : true }; });
verifier('le rond « casque » est là : 56 px, au-dessus de la barre du bas', !!b && b.w === 56 && b.audessus, JSON.stringify(b));
await ouvrirAssistant();
verifier('la feuille s\'ouvre : bonjour avec le prénom, trois questions proposées, un champ, « Parler à CLT »', /Bonjour Yao/.test(await texteDe('#clt-assistant-fil')) && (await page.locator('#clt-assistant .clt-assistant__q').count()) === 3 && (await page.locator('#clt-assistant-champ').count()) === 1 && /Parler à CLT/.test(await texteDe('#clt-assistant')));
let rep = await demander('Où est ma course ?');
verifier('« Où est ma course ? » → « récupérée : le coursier est en route vers la livraison (Sery Coursier) », avec « Y aller »', /Adjamé — Marché → Cocody — Riviera 3 est récupérée : le coursier est en route vers la livraison \(Sery Coursier\)/.test(rep) && (await page.locator('#clt-assistant [data-assistant-aller="section-courses"]').count()) === 1, rep);
rep = await demander('C\'est quoi le code ?');
verifier('« le code ? » → le code 0472 de la course en cours', /0472/.test(rep) && /Donnez-le à la personne qui reçoit/.test(rep), rep);
rep = await demander('comment annuler une course');
verifier('une question d\'aide → des fiches à ouvrir (annuler en premier)', /Annuler une course/.test(rep), rep);
await page.evaluate(() => document.querySelector('#clt-assistant [data-aide-ouvrir="express-annuler"]').click());
await dodo(1200);
verifier('la fiche s\'ouvre dans l\'aide, l\'assistant s\'est rangé', (await page.locator('#clt-aide').count()) === 1 && await page.evaluate(() => document.getElementById('clt-assistant').classList.contains('hidden')) && /Annuler une course/.test(await texteDe('#clt-aide')));
// Échap ferme l'aide ; le gestionnaire des couches rejoue l'historique un instant après : on le laisse finir.
await page.keyboard.press('Escape'); await dodo(1500);
await ouvrirAssistant();
rep = await demander('je veux parler à quelqu\'un');
await dodo(400);
const wa = await page.evaluate(() => { const a = document.querySelector('#clt-assistant-fil .clt-assistant__wa'); return a ? decodeURIComponent(a.href) : '(absent : ' + !!document.getElementById('clt-assistant') + ' / aide ' + !!document.getElementById('clt-aide') + ')'; });
verifier('« parler à quelqu\'un » → WhatsApp avec le contexte : le nom, le rôle, la question', /Parler à CLT sur WhatsApp/.test(rep) && /wa\.me\/2250546818640/.test(wa) && /je suis Yao Express \(client Express\)/.test(wa) && /Ma question : je veux parler à quelqu'un/.test(wa), wa);
await page.keyboard.press('Escape'); await dodo(400);
verifier('Échap ferme la feuille (c\'est une couche), sans quitter la page', await page.evaluate(() => document.getElementById('clt-assistant').classList.contains('hidden') && /express-client\.html/.test(location.pathname)));

titre('2. Le coursier : mon solde');
await N.ouvrirConnecte('express-coursier.html', COURSIER);
await dodo(2000);
await ouvrirAssistant();
rep = await demander('Mon solde ?');
verifier('« Mon solde ? » → 1 350 F, au-dessus du minimum, « vous pouvez accepter des courses »', /1.350 F/.test(rep) && /Vous pouvez accepter des courses/.test(rep), rep);

titre('3. La cliente : combien CLT me doit ; le livreur : ma journée');
await N.ouvrirConnecte('fournisseur.html', CLIENTE1);
await dodo(2000);
await ouvrirAssistant();
rep = await demander('Combien CLT me doit ?');
verifier('« Combien CLT me doit ? » → un montant, et « Récap »', /CLT vous doit aujourd'hui/.test(rep) && /\d/.test(rep), rep);
rep = await demander('Où en sont mes colis ?');
verifier('« Où en sont mes colis ? » → aujourd\'hui : les colis du jour comptés par état (1 livré, 1 en livraison…)', /colis/.test(rep) && /1 livré/.test(rep) && /1 en livraison/.test(rep), rep);
await N.ouvrirConnecte('livreur.html', LIVREUR);
await dodo(2500);
await ouvrirAssistant();
rep = await demander('Ma journée ?');
verifier('livreur, « Ma journée ? » → ses colis du jour comptés par état', /colis/.test(rep) && /\d/.test(rep), rep);

titre('4. L\'équipe : qu\'est-ce qui attend ?');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(2500);
await page.setViewportSize({ width: 1440, height: 900 });
await ouvrirAssistant();
rep = await demander('Qu\'est-ce qui attend ?');
verifier('équipe → le nombre de lignes de « À traiter », avec le bouton pour l\'ouvrir', /attend/.test(rep) && (await page.locator('#clt-assistant [data-assistant-onglet="retours"]').count()) === 1, rep);
await page.evaluate(() => document.querySelector('#clt-assistant [data-assistant-onglet="retours"]').click());
await dodo(800);
verifier('« Ouvrir À traiter » y va', await page.evaluate(() => !!document.querySelector('#clt-toptabs .clt-toptab[data-eqtab="retours"].active')));
const bo = await page.evaluate(() => { const r = document.getElementById('clt-assistant-bouton').getBoundingClientRect(); const h = document.querySelector('.clt-haut'); const hr = h ? h.getBoundingClientRect() : null; return { w: Math.round(r.width), bas: Math.round(window.innerHeight - r.bottom), gauche: Math.round(r.left), chevauche: hr ? !(r.right < hr.left || r.left > hr.right || r.bottom < hr.top || r.top > hr.bottom) : false }; });
verifier('sur ordinateur, le rond est plus petit (52 px), en bas à GAUCHE, sans chevaucher « Remonter »', bo.w === 52 && bo.bas === 22 && bo.gauche === 22 && !bo.chevauche, JSON.stringify(bo));

titre('4 bis. L\'étage 3 : l\'IA qui comprend (fonction serveur simulée)');
const appels = [];
monde.fonctions['assistant-repondre'] = async (corps, entetes) => {
  appels.push({ corps, auth: !!(entetes.authorization || entetes.Authorization) });
  if (appels.length === 1) return { reponse: 'Votre course est récupérée : le coursier arrive. Donnez-lui le code à 4 chiffres à la remise, et rien avant.', fiche: (corps.fiches[0] || {}).id || null, humain: false };
  return { reponse: 'Je ne vois pas de remboursement dans votre situation : il vaut mieux en parler à CLT.', fiche: null, humain: true };
};
await N.ouvrirConnecte('express-client.html', CLIENT_EXPRESS);
await dodo(1800);
await ouvrirAssistant();
rep = await demander('je dois faire quoi quand le livreur est devant chez moi ?');
verifier('une phrase libre part à l\'IA : avec le jeton, l\'espace, la SITUATION (la course en cours) et les fiches proches', appels.length === 1 && appels[0].auth && appels[0].corps.espace === 'express-client' && /Riviera 3 est récupérée/.test(appels[0].corps.situation) && Array.isArray(appels[0].corps.fiches), JSON.stringify(appels[0] && { auth: appels[0].auth, espace: appels[0].corps.espace, situation: (appels[0].corps.situation || '').slice(0, 80), fiches: (appels[0].corps.fiches || []).length }));
verifier('la réponse de l\'IA s\'affiche, avec la fiche qu\'elle recommande', /Donnez-lui le code à 4 chiffres/.test(rep) && (await page.locator('#clt-assistant-fil .clt-assistant__fiche').count()) >= 1, rep);
rep = await demander('et si le colis est cassé, on me rembourse ?');
verifier('l\'historique suit ; « [HUMAIN] » → la réponse plus le bouton WhatsApp', appels.length === 2 && appels[1].corps.historique.length === 2 && /en parler à CLT/.test(rep) && (await page.locator('#clt-assistant-fil .clt-assistant__wa').count()) >= 1, rep);
rep = await demander('Où est ma course ?');
verifier('une question qu\'une règle reconnaît n\'appelle PAS l\'IA (étage 2 d\'abord)', appels.length === 2 && /Sery Coursier/.test(rep), rep);
monde.fonctions['assistant-repondre'] = async () => ({ repli: true, pourquoi: 'sans_cle' });
await N.ouvrirConnecte('express-client.html', CLIENT_EXPRESS);
await dodo(1800);
await ouvrirAssistant();
rep = await demander('comment faire pour annuler ma commande');
const appelsAvant = appels.length;
await demander('pourquoi le prix change selon la distance');
verifier('sans clé (repli) : les fiches comme avant, sans erreur, et l\'IA n\'est plus rappelée de la session', /Annuler une course/.test(rep) && appels.length === appelsAvant, rep);

titre('5. Téléphone, la nuit');
await page.setViewportSize({ width: 390, height: 844 });
await N.ouvrirConnecte('express-coursier.html', COURSIER);
await dodo(2000);
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await ouvrirAssistant();
const m = await page.evaluate(() => { const f = document.querySelector('#clt-assistant .clt-assistant__boite'); const r = f.getBoundingClientRect(); const h = (s) => Math.round(f.querySelector(s).getBoundingClientRect().height); const cs = getComputedStyle(f.querySelector('.clt-assistant__bulle--clt')); return { largeur: Math.round(r.width), champ: h('#clt-assistant-champ'), q: h('.clt-assistant__q'), envoyer: h('.clt-assistant__saisie .btn'), couleur: cs.color, fond: cs.backgroundColor, deborde: f.scrollWidth > f.clientWidth + 1 }; });
verifier('la feuille tient sur 390 px, champ ≥ 44, boutons ≥ 40 / 44, lisible la nuit', m.largeur <= 390 && m.champ >= 44 && m.q >= 40 && m.envoyer >= 44 && m.couleur !== m.fond && !m.deborde, JSON.stringify(m));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
