/* PARCOURS — LE COMPTE OBSERVATEUR (26 septembre 2026, lot OB, v291)
     1. Un équipier observateur ouvre l'application : le bandeau le dit ; il voit ses onglets ;
     2. il tente d'écrire (colis, fichier, fonction du serveur) : rien ne part, un avis clair s'affiche ;
     3. l'administrateur voit « 👁 Observateur » sur sa ligne et lui donne le droit d'agir, confirmé ;
     4. téléphone et ordinateur, clair et nuit ; zéro erreur.
   Lancer à la main :  node tests/parcours/le-compte-observateur.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, ADMIN } from './_monde.mjs';

const OBS = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const monde = nouveauMonde();
monde.PROFILS.push({ id: OBS, full_name: 'Aya Stagiaire', role: 'equipe', phone: '2250700000041', status: 'valide', company_name: null, avatar_url: null, acces_operations: true, acces_paie: false, acces_compta: false, observateur: true, observateur_depuis: new Date().toISOString(), suppression_demandee_at: null, created_at: new Date().toISOString() });

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const txt = async (sel) => ((await page.locator(sel).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

titre('1. L\'observateur ouvre l\'application');
await page.setViewportSize({ width: 390, height: 844 });
await N.ouvrirConnecte('equipe.html', OBS); await dodo(2500);
verifier('le bandeau « Mode observateur » est en haut', await page.locator('#clt-observateur').isVisible() && /Mode observateur/.test(await txt('#clt-observateur')), await txt('#clt-observateur'));
verifier('il dit la règle : consultez tout, sans rien modifier', /consultez tout, sans rien modifier/.test(await txt('#clt-observateur')));
verifier('il voit ses onglets (Colis)', await page.locator('[data-nav="colis"]').first().isVisible().catch(() => false));
if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/observateur-390.png' });

titre('2. Il tente d\'écrire : rien ne part');
const avant = monde.journal.filter((j) => j.table === 'colis' && /insert|update|delete/.test(j.op)).length;
const r = await page.evaluate(async () => {
  const a = await supabaseClient.from('colis').insert({ description: 'essai' }).select().single();
  const b = await supabaseClient.from('colis').update({ statut: 'livre' }).eq('id', 'x');
  const c = await supabaseClient.storage.from('photos').upload('x.jpg', new Blob(['x']));
  const d = await supabaseClient.functions.invoke('creer-client', { body: {} });
  return [a, b, c, d].map((x) => x && x.error && x.error.code);
});
verifier('ajout, modification, fichier, fonction : refusés avant de partir', r.every((c) => c === 'CLT_OBSERVATEUR'), r.join(','));
verifier('la base n\'a rien reçu', monde.journal.filter((j) => j.table === 'colis' && /insert|update|delete/.test(j.op)).length === avant);
await dodo(400);
verifier('un avis clair s\'affiche', /Mode observateur/.test(await page.evaluate(() => document.body.innerText)));
const lu = await page.evaluate(async () => (await supabaseClient.from('colis').select('id').limit(1)).error);
verifier('la lecture passe', !lu);

titre('3. L\'administrateur lui donne le droit d\'agir');
await page.setViewportSize({ width: 1440, height: 900 });
await N.ouvrirConnecte('equipe.html', ADMIN); await dodo(2500);
verifier('pas de bandeau pour l\'administrateur', await page.locator('#clt-observateur').count() === 0);
await page.evaluate(() => showEquipeTab('comptes')); await dodo(2000);
const ligne = page.locator(`#all-accounts-list .colis-item[data-id="${OBS}"]`);
verifier('la ligne porte « 👁 Observateur »', /Observateur/.test(await ligne.innerText().catch(() => '')));
verifier('création d\'un compte équipe : « Commencer en observateur » coché', await page.locator('#eq-observateur').isChecked().catch(() => false));
await ligne.locator('.actions-menu-btn').click(); await dodo(300);
await ligne.locator('.btn-toggle-observateur').click(); await dodo(500);
verifier('le geste est confirmé', /Donner le droit/.test(await txt('#confirm-modal-ok')), await txt('#confirm-modal-ok'));
if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/observateur-confirmer-1440.png' });
await page.locator('#confirm-modal-ok').click(); await dodo(1500);
verifier('la base reçoit « observateur : non »', monde.journal.some((j) => j.table === 'profiles' && j.op === 'update' && j.valeurs && j.valeurs.observateur === false));
verifier('et le journal le trace', monde.journal.some((j) => j.table === 'activity_log' && JSON.stringify(j.valeurs || '').includes('observateur_retire')));

titre('4. Nuit et petits écrans');
monde.PROFILS.find((p) => p.id === OBS).observateur = true;   // de nouveau observateur, pour les captures
await N.ouvrirConnecte('equipe.html', OBS); await dodo(2000);
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await dodo(300);
for (const w of [320, 768, 1440]) {
  await page.setViewportSize({ width: w, height: 800 }); await dodo(300);
  verifier(`à ${w} px : le bandeau tient, rien ne déborde`, await page.locator('#clt-observateur').isVisible() && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/observateur-' + w + '-nuit.png' });
}
verifier('contraste du bandeau de nuit ≥ 4,5', await page.locator('#clt-observateur').evaluate((e) => {
  const c = (s) => s.match(/\d+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  const L = (a) => 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  const s = getComputedStyle(e); const a = L(c(s.color)), b = L(c(s.backgroundColor));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5;
}));

verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
await N.fermer();
process.exit(bilan() ? 1 : 0);
