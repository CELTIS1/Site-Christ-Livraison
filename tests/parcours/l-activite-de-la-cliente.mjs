/* PARCOURS 35 — L'ACTIVITÉ DE LA CLIENTE (23 septembre 2026, lot « activité »)
   ==========================================================================================
   Celtis : « que les clientes renseignent le type d'activité qu'elles font ; on saura quel
   vendeur vend quel produit ». La cliente remplit « Mon activité » dans Mon compte, sa ligne
   part en base ; le bureau la voit sous son nom et peut la corriger dans la fiche ; Gestion
   l'additionne dans « Qui vend quoi ». Rien de tout cela n'est visible sans le vrai clic.

   Lancer à la main :  node tests/parcours/l-activite-de-la-cliente.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { CLIENTE1, ADMIN } from './_monde.mjs';

const N = await ouvrirNavigateur();
const { page, monde, erreurs, texte } = N;
const lireTexte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
await page.setViewportSize({ width: 390, height: 844 });

titre('1. La cliente : Mon compte › Mon activité');
await N.ouvrirConnecte('fournisseur.html', CLIENTE1);
await dodo(1200);
await page.evaluate(() => document.getElementById('btn-mon-compte').click());
await dodo(600);
const form = page.locator('#form-activite');
verifier('le bloc « Mon activité » est dans Mon compte, avec sa liste de secteurs et ses canaux', await form.isVisible() && (await form.locator('[data-act="secteur"] option').count()) === 11 && (await form.locator('.act-chip').count()) === 7);
verifier('rien n\'est pré-coché : l\'accord est à elle', !(await form.locator('[data-act="presentable"]').isChecked()));
await form.locator('[data-act="secteur"]').selectOption('mode');
await form.locator('[data-act="produits"]').fill('Robes wax, sacs');
await form.locator('.act-chip').filter({ hasText: 'WhatsApp' }).click();
await form.locator('.act-chip').filter({ hasText: 'Instagram' }).click();
await form.locator('[data-act="lien"]').fill('instagram.com/awaboutique');
await form.locator('[data-act="presentable"]').check();
const avant = monde.journal.length;
await form.locator('button[type="submit"]').click();
await dodo(900);
const ecrit = monde.journal.slice(avant).find((j) => j.table === 'activites_clientes');
verifier('un enregistrement part en base : sa ligne, ses cinq champs, le lien complété', !!ecrit && ecrit.valeurs[0].profile_id === CLIENTE1 && ecrit.valeurs[0].secteur === 'mode' && ecrit.valeurs[0].canaux.length === 2 && ecrit.valeurs[0].lien === 'https://instagram.com/awaboutique' && ecrit.valeurs[0].presentable === true, JSON.stringify(ecrit).slice(0, 300));
verifier('l\'écran confirme avec le résumé', /Activité enregistrée : Mode et vêtements · Robes wax, sacs · WhatsApp, Instagram/.test(await texte('#act-msg')) && /CLT peut vous présenter/.test(await texte('#act-msg')), await texte('#act-msg'));
const chips = await form.locator('.act-chip').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
verifier('les cases des canaux sont des cibles tactiles (≥ 36 px), rien ne déborde', chips.every((h) => h >= 36) && !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), chips.join(','));
verifier('aucune erreur dans la page', erreurs.length === 0, erreurs.join('\n       '));

titre('2. Le bureau : la ligne sous son nom, et la fiche pour corriger');
await page.setViewportSize({ width: 1440, height: 900 });
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(3000);
await page.locator('[data-eqtab="comptes"]').first().click();
await page.locator('#all-accounts-list .colis-item').first().waitFor({ timeout: 20000 }).catch(() => {});
await dodo(800);
const carte = page.locator('#all-accounts-list .colis-item').filter({ hasText: 'Awa Boutique' }).first();
verifier('sous le nom d\'Awa : « Mode et vêtements · Robes wax, sacs · WhatsApp, Instagram » et « Présentable »', (await carte.count()) === 1 && /Mode et vêtements · Robes wax, sacs · WhatsApp, Instagram/.test(await lireTexte(carte)) && /Présentable/.test(await lireTexte(carte)), (await lireTexte(carte)).slice(0, 240));
// Le bouton « Corriger la fiche » vit dans le menu ⋮ de la carte : on l'actionne tel quel.
await carte.locator('.btn-edit-account').first().evaluate((b) => b.click());
await dodo(700);
const box = page.locator('#fiche-activite-box');
if (await box.isVisible().catch(() => false)) {
  verifier('la fiche montre son activité, déjà remplie', (await box.locator('[data-act="secteur"]').inputValue()) === 'mode' && (await box.locator('[data-act="presentable"]').isChecked()));
  await box.locator('[data-act="produits"]').fill('Robes wax, sacs, chaussures');
  const avant2 = monde.journal.length;
  await box.locator('button[type="submit"]').click();
  await dodo(900);
  const e2 = monde.journal.slice(avant2).find((j) => j.table === 'activites_clientes');
  verifier('le bureau corrige : une seule ligne pour Awa, remplacée', !!e2 && e2.valeurs[0].produits === 'Robes wax, sacs, chaussures');
  await page.evaluate(() => { const b = document.getElementById('fiche-modal-cancel'); if (b) b.click(); });
  await dodo(500);
  verifier('la liste montre la correction', /chaussures/.test(await lireTexte(page.locator('#all-accounts-list .colis-item').filter({ hasText: 'Awa Boutique' }).first())));
} else {
  verifier('la fiche du compte s\'ouvre avec le bloc activité', false, 'bouton « Corriger la fiche » introuvable sur la carte');
}

titre('3. Gestion : « Qui vend quoi »');
await N.ouvrirConnecte('gestion.html', ADMIN);
await dodo(3500);
// Depuis le 26/09, les cartes d'analyse du tableau de bord sont repliées par défaut : on déplie celle-ci, comme le gérant.
await page.evaluate(() => window.CLTGestionReplier.basculerCarte(document.getElementById('cdd-qui-vend-quoi'), false)); await dodo(300);
const boite = page.locator('#cdd-qui-vend-quoi');
await boite.scrollIntoViewIfNeeded().catch(() => {});
const t = await lireTexte(boite);
verifier('la boîte compte : 1 fiche sur 2 clientes, 1 présentable, mode en tête, un canal, au singulier', /1 fiche sur 2 clientes/.test(t) && /1 présentable/.test(t) && /mode et vêtements \(1\)/.test(t) && /via (WhatsApp|Instagram)/.test(t) && /1 cliente sur 2 a renseigné son activité/.test(t), t.slice(0, 300));
await boite.locator('[data-qvq-vue="liste"]').click();
await dodo(300);
const tl = await lireTexte(boite);
verifier('la liste nomme Awa, son secteur, ce qu\'elle vend, et « Oui » pour l\'accord', /Awa Boutique/.test(tl) && /Robes wax/.test(tl) && /Oui/.test(tl), tl.slice(0, 300));
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await dodo(200);
const contraste = await boite.locator('.cdc-phrase').evaluate((el) => { const s = getComputedStyle(el); return s.color + ' / ' + s.backgroundColor; });
verifier('la nuit, la phrase a sa couleur de nuit (pas du noir sur du sombre)', !/rgb\(0, 0, 0\)/.test(contraste), contraste);
verifier('aucune erreur dans Gestion', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
