/* PARCOURS — « 👁 VOIR SON ÉCRAN » : L'ADMINISTRATEUR REGARDE UN COMPTE, EN LECTURE SEULE (21 septembre 2026)
   ==========================================================================================
   Celtis : « que l'administrateur puisse parcourir tous les comptes et voir exactement ce qu'ils voient ».

   Ce parcours ouvre les VRAIS écrans dans un vrai Chromium et tient cinq choses :
     1. le bouton est là pour l'administrateur, sur un livreur et une cliente, et ouvre la bonne adresse ;
     2. l'écran du livreur s'ouvre avec SES colis (pas ceux des autres), sous un bandeau qui le dit ;
     3. rien ne peut s'écrire : ni par le code, ni par un bouton de l'écran ;
     4. l'écran de la cliente, pareil ;
     5. pour tout autre que l'administrateur, « ?voir= » n'ouvre rien.

   Lancer à la main :  node tests/parcours/voir-son-ecran.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, colis, iso, ADMIN, LIVREUR, CLIENTE1, CLIENTE2 } from './_monde.mjs';

const AUTRE_LIVREUR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const EQUIPE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8';
const monde = nouveauMonde();
monde.PROFILS.push({ id: AUTRE_LIVREUR, full_name: 'Moussa D.', role: 'livreur', phone: '2250700000002', status: 'valide', avatar_url: null, company_name: null });
monde.PROFILS.push({ id: EQUIPE, full_name: 'Aïcha du bureau', role: 'equipe', phone: '2250700000008', status: 'valide', avatar_url: null, company_name: null, acces_operations: true });
monde.TABLES.colis.push(colis(901, { numero: 'CLT-AUTRE-901', statut: 'en_livraison', created_at: iso(0, 8), fournisseur_id: CLIENTE2, livreur_id: AUTRE_LIVREUR, livreur_collecte_id: AUTRE_LIVREUR }));
monde.TABLES.consultations_de_compte = [];
/* SANS LIMITES (21/09/2026) : CLIENTE1 est PROPRIÉTAIRE et supervise la boutique CLIENTE2 ; une troisième
   cliente n'a rien à voir avec elle. Le livreur a des primes en cours et une remise annoncée. */
const CLIENTE3 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
monde.PROFILS.push({ id: CLIENTE3, full_name: 'Fatou', role: 'fournisseur', phone: '2250700000033', status: 'valide', avatar_url: null, company_name: 'Chez Fatou' });
monde.TABLES.colis.push(colis(902, { numero: 'CLT-ETRANGER-902', statut: 'livre', created_at: iso(0, 8), fournisseur_id: CLIENTE3, livreur_id: AUTRE_LIVREUR }));
monde.TABLES.boutiques_supervisees.push({ superviseur_id: CLIENTE1, fournisseur_id: CLIENTE2 });
monde.REPONSES_RPC.primes_en_cours_de = { [LIVREUR]: { eligible: true, marque: 'PRIMES-DE-KOFFI' } };
(monde.TABLES.annonces_remise ||= []).push({ id: 'an1', livreur_id: LIVREUR, montant_annonce: 11500, montant_porte: null, note: null, remise_id: null, created_at: iso(0, 17) });
(monde.TABLES.reversements_clientes ||= []).push({ id: 'rv-autre', numero: 'REV-AUTRE-777', fournisseur_id: CLIENTE2, montant: 77700, nb_colis: 1, colis_ids: [], mode: 'especes', note: null, fait_le: iso(0, 10), annule_le: null, annule_motif: null });

const N = await ouvrirNavigateur({ monde });
const { page, base, erreurs } = N;
const nomDe = (id) => { const p = monde.PROFILS.find((x) => x.id === id); return p.company_name || p.full_name; };

/* L'onglet que le bouton ouvre reçoit une COPIE du stockage de session de l'écran Équipe. On refait
   la même chose ici : la connexion de `qui` dans le stockage de session, puis l'adresse. */
async function ouvrirCommeOnglet(adresse, qui, { durable = false } = {}) {
  const profil = monde.PROFILS.find((p) => p.id === qui);
  const user = { id: qui, phone: profil.phone, user_metadata: { full_name: profil.full_name } };
  await page.goto(base + '/app/manifest-login.json', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ user, durable }) => {
    sessionStorage.clear(); localStorage.removeItem('clt-faux-session');
    const session = { access_token: 'jeton.' + btoa(unescape(encodeURIComponent(JSON.stringify(user)))), refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user };
    (durable ? localStorage : sessionStorage).setItem('clt-faux-session', JSON.stringify(session));
  }, { user, durable });
  await page.goto(base + '/app/' + adresse, { waitUntil: 'load' }).catch(() => {});
  await dodo(2500);
}
const photoDeLaBase = () => JSON.stringify([monde.TABLES.colis, monde.TABLES.programmations_collecte, monde.PROFILS]);

titre('1. Équipe › Comptes : le bouton, pour l\'administrateur');
await N.ouvrirConnecte('equipe.html', ADMIN);
await page.evaluate(async () => { await loadAllAccounts(); });
await dodo(1200);
const boutons = await page.evaluate(() => Array.from(document.querySelectorAll('#all-accounts-list .btn-voir-compte')).map((b) => ({ lien: b.dataset.lien, pour: b.closest('.colis-item').dataset.id })));
verifier('un bouton « Voir son écran » sur le livreur, vers son écran', boutons.some((b) => b.pour === LIVREUR && b.lien === 'livreur.html?voir=' + LIVREUR), JSON.stringify(boutons).slice(0, 300));
verifier('un sur la cliente, vers son écran', boutons.some((b) => b.pour === CLIENTE1 && b.lien === 'fournisseur.html?voir=' + CLIENTE1));
verifier('aucun sur l\'équipe ni sur l\'administrateur lui-même', !boutons.some((b) => b.pour === EQUIPE || b.pour === ADMIN));
await page.evaluate((id) => { const b = document.querySelector('#all-accounts-list .colis-item[data-id="' + id + '"] .btn-voir-compte'); b.click(); }, LIVREUR);
await dodo(300);
verifier('un appui ouvre un nouvel onglet sur cette adresse', (await page.evaluate(() => window.__cltOuverts[window.__cltOuverts.length - 1] || '')) === 'livreur.html?voir=' + LIVREUR);

titre('2. L\'écran du livreur, avec SES données, sous le bandeau');
await ouvrirCommeOnglet('livreur.html?voir=' + LIVREUR, ADMIN);
verifier('on est bien sur l\'écran du livreur (pas renvoyé ailleurs)', /livreur\.html\?voir=/.test(page.url()), page.url());
const bandeau = ((await page.locator('#clt-vue-compte').textContent().catch(() => '')) || '').replace(/\s+/g, ' ');
verifier('le bandeau nomme la personne et dit « lecture seule »', bandeau.includes(nomDe(LIVREUR) + ' (livreur)') && /Vous regardez son écran/.test(bandeau) && /lecture seule/.test(bandeau) && /Quitter/.test(bandeau), bandeau);
verifier('le nom affiché en haut est le SIEN, pas celui du gérant', ((await page.locator('#user-name').textContent()) || '').trim() === nomDe(LIVREUR));
const vus = await page.evaluate(() => (typeof allColis !== 'undefined' ? allColis : []).map((c) => ({ n: c.numero, l: c.livreur_id, lc: c.livreur_collecte_id, r: c.retour_detenteur_livreur_id })));
verifier('l\'écran a des colis', vus.length > 0, String(vus.length));
verifier('tous sont à LUI (livraison, collecte ou retour en main) — aucun colis d\'un autre livreur', vus.every((c) => [c.l, c.lc, c.r].includes(LIVREUR)) && !vus.some((c) => c.n === 'CLT-AUTRE-901'), JSON.stringify(vus.filter((c) => ![c.l, c.lc, c.r].includes(LIVREUR))).slice(0, 300));
verifier('la consultation a été notée : qui, quel compte', monde.TABLES.consultations_de_compte.length === 1 && monde.TABLES.consultations_de_compte[0].admin_id === ADMIN && monde.TABLES.consultations_de_compte[0].compte_id === LIVREUR, JSON.stringify(monde.TABLES.consultations_de_compte));
verifier('« Se déconnecter » est caché', !(await page.locator('[data-cache-si-regarde]').first().isVisible().catch(() => false)));

titre('3. Rien ne s\'écrit');
const avant = photoDeLaBase();
const essais = await page.evaluate(async (id) => {
  const un = (await supabaseClient.from('colis').select('id').limit(1)).data[0];
  const r = {};
  r.update = (await supabaseClient.from('colis').update({ statut: 'livre' }).eq('id', un.id).select().single()).error;
  r.insert = (await supabaseClient.from('colis').insert({ numero: 'PIRATE' })).error;
  r.upsert = (await supabaseClient.from('profiles').upsert({ id, full_name: 'Changé' })).error;
  r.suppr = (await supabaseClient.from('colis').delete().eq('id', un.id)).error;
  r.rpc = (await supabaseClient.rpc('confirmer_recuperation', { p_programmation_id: 'p1', p_nb_pris: 3, p_note: null })).error;
  r.fonction = (await supabaseClient.functions.invoke('admin-modifier-compte', { body: {} })).error;
  r.primes = await supabaseClient.rpc('primes_en_cours');
  r.annonce = await supabaseClient.rpc('annonce_remise_en_cours', { p_livreur_id: 'un-autre-identifiant' });
  r.boutiquesChezUnLivreur = await supabaseClient.rpc('mes_boutiques');
  r.fonctionAdminDirecte = (await supabaseClient.rpc('primes_en_cours_de', { p_livreur: id })).error;
  return r;
}, LIVREUR);
verifier('modifier, ajouter, remplacer, supprimer : refusés avant de partir', ['update', 'insert', 'upsert', 'suppr'].every((k) => essais[k] && essais[k].code === 'CLT_LECTURE_SEULE'), JSON.stringify(essais));
verifier('les fonctions de la base et du serveur : refusées', !!essais.rpc && !!essais.fonction);
verifier('SANS LIMITES — ses primes en cours sont les SIENNES (plus une carte vide)', !essais.primes.error && essais.primes.data && essais.primes.data.marque === 'PRIMES-DE-KOFFI', JSON.stringify(essais.primes));
verifier('son annonce de remise aussi, et toujours pour LUI même si l\'écran passait un autre identifiant', !essais.annonce.error && Array.isArray(essais.annonce.data) && essais.annonce.data[0].montant_annonce === 11500, JSON.stringify(essais.annonce));
verifier('une lecture qui n\'a pas de sens pour ce rôle rend « rien », sans erreur ; une fonction appelée hors de la règle est refusée', essais.boutiquesChezUnLivreur.data === null && essais.boutiquesChezUnLivreur.error === null && !!essais.fonctionAdminDirecte);
verifier('la base n\'a pas bougé d\'une virgule', photoDeLaBase() === avant);
verifier('et l\'écran a dit pourquoi', /lecture seule/i.test((await page.locator('.clt-toast, .toast, [class*="toast"]').first().textContent().catch(() => '')) || ''));
// Un vrai bouton de l'écran : le premier geste proposé sur un colis.
const geste = page.locator('#section-mes-colis button:visible, #mes-colis-list button:visible').first();
if (await geste.count()) { await geste.click().catch(() => {}); await dodo(800); const ok = page.locator('#clt-modal-ok:visible'); if (await ok.count()) { await ok.click().catch(() => {}); await dodo(800); } }
verifier('même en appuyant sur un bouton de l\'écran, la base ne bouge pas', photoDeLaBase() === avant);

titre('4. L\'écran de la cliente, pareil');
await ouvrirCommeOnglet('fournisseur.html?voir=' + CLIENTE1, ADMIN);
const bandeauC = ((await page.locator('#clt-vue-compte').textContent().catch(() => '')) || '').replace(/\s+/g, ' ');
verifier('le bandeau nomme la cliente', bandeauC.includes(nomDe(CLIENTE1) + ' (cliente)'), bandeauC);
const vusC = await page.evaluate(() => (typeof mesColis !== 'undefined' ? mesColis : []).map((c) => c.fournisseur_id));
verifier('ses colis, et seulement les siens', vusC.length > 0 && vusC.every((f) => f === CLIENTE1), JSON.stringify(vusC.slice(0, 5)));
const reversements = await page.evaluate(async () => (await supabaseClient.from('reversements_clientes').select('numero, fournisseur_id')).data || []);
verifier('les reversements des AUTRES clientes ne lui sont pas montrés (l\'administrateur, lui, les voit tous)', !reversements.some((r) => r.numero === 'REV-AUTRE-777') && !/REV-AUTRE-777|77\s?700/.test(await page.locator('body').innerText()), JSON.stringify(reversements));
const proprio = await page.evaluate(async ({ b, e }) => {
  const mb = await supabaseClient.rpc('mes_boutiques');
  const deLaBoutique = (await supabaseClient.from('colis').select('numero, fournisseur_id').in('fournisseur_id', [b])).data || [];
  const etrangere = (await supabaseClient.from('colis').select('numero').in('fournisseur_id', [e])).data || [];
  const tous = (await supabaseClient.from('colis').select('fournisseur_id')).data || [];
  return { boutiques: (mb.data || []).map((x) => x.id), erreur: mb.error, deLaBoutique: deLaBoutique.length, etrangere: etrangere.length, proprietaires: Array.from(new Set(tous.map((c) => c.fournisseur_id))).sort() };
}, { b: CLIENTE2, e: CLIENTE3 });
verifier('SANS LIMITES — « Mes boutiques » de la propriétaire rend SES boutiques', !proprio.erreur && JSON.stringify(proprio.boutiques) === JSON.stringify([CLIENTE2]), JSON.stringify(proprio));
verifier('les colis de sa boutique lui sont montrés, comme chez elle', proprio.deLaBoutique > 0, JSON.stringify(proprio));
verifier('ceux d\'une cliente qui n\'a rien à voir avec elle : jamais', proprio.etrangere === 0 && JSON.stringify(proprio.proprietaires) === JSON.stringify([CLIENTE1, CLIENTE2].sort()), JSON.stringify(proprio));
const avantC = photoDeLaBase();
const refusC = await page.evaluate(async () => (await supabaseClient.from('colis').insert({ numero: 'PIRATE' })).error);
verifier('elle non plus ne peut rien recevoir de faux : écriture refusée, base intacte', !!refusC && refusC.code === 'CLT_LECTURE_SEULE' && photoDeLaBase() === avantC);
verifier('« Quitter » est là, et fait 44 px de haut', (await page.locator('.clt-vue-compte__quitter').evaluate((b) => b.getBoundingClientRect().height)) >= 44);

titre('5. Pour tout autre que l\'administrateur, « ?voir= » n\'ouvre rien');
await ouvrirCommeOnglet('livreur.html?voir=' + AUTRE_LIVREUR, LIVREUR, { durable: true });
verifier('un livreur qui ajoute « ?voir= » à son adresse : renvoyé à la connexion, il ne voit personne', /login\.html/.test(page.url()) && (await page.locator('#clt-vue-compte').count()) === 0, page.url());
await ouvrirCommeOnglet('livreur.html?voir=' + LIVREUR, EQUIPE);
verifier('quelqu\'un de l\'équipe (pas administrateur) : renvoyé à l\'écran Équipe', /equipe\.html/.test(page.url()) && (await page.locator('#clt-vue-compte').count()) === 0, page.url());
await ouvrirCommeOnglet('fournisseur.html?voir=' + LIVREUR, ADMIN);
verifier('l\'administrateur qui demande un livreur sur l\'écran cliente : rien ne s\'ouvre', /equipe\.html/.test(page.url()), page.url());
await ouvrirCommeOnglet('livreur.html?voir=' + EQUIPE, ADMIN);
verifier('ni l\'écran d\'un compte de l\'équipe', /equipe\.html/.test(page.url()), page.url());
verifier('seules les deux vraies consultations ont été notées', monde.TABLES.consultations_de_compte.length === 2, JSON.stringify(monde.TABLES.consultations_de_compte));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
