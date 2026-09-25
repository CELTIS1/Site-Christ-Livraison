/* PARCOURS — LE BUREAU DU GÉRANT ET LES DIX CHIFFRES (chantier N, lot 15, 25 septembre 2026)
   ==========================================================================================
   Celtis : « j'ai mon propre compte, après j'ai le côté gestion, et vraiment c'est beaucoup. Je
   ne sais même pas si je dois le dissocier. » Décision (proposition d'architecture, § 4.4) : une
   seule application. Gestion vit derrière l'onglet « Bureau » de l'espace équipe, intégrée
   (sans sa barre du haut), même session ; et le tableau de bord ouvre sur les dix chiffres de
   la semaine, chacun avec son verdict, chacun menant à l'onglet de l'équipe.

   Lancer à la main :  node tests/parcours/le-bureau-du-gerant.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, colis, iso, ADMIN, LIVREUR, CLIENTE1 } from './_monde.mjs';

const monde = nouveauMonde();
monde.TABLES.colis.push(colis(95, { numero: 'CLT-DIX-95', statut: 'non_livre', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, created_at: iso(-1, 8), recupere_at: iso(-1, 9), non_livre_at: iso(-1, 16), echec_imputable: true, motif_non_livraison: 'client_absent' }));
monde.TABLES.reclamations_clientes.push({ id: 'rc-dix', fournisseur_id: CLIENTE1, colis_id: null, motif: 'montant_faux', texte: 'test', statut: 'ouverte', created_at: iso(-3, 9) });

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;
const texte = async (loc) => ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

titre('1. L\'onglet « Bureau », pour l\'administrateur, dans la même application');
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(1800);
await page.setViewportSize({ width: 1440, height: 900 });
verifier('l\'onglet « 🏛️ Bureau » est visible en haut, et « Bureau » derrière « Plus » en bas', await page.locator('#eqtab-btn-bureau').isVisible() && !(await page.locator('#bottomnav-bureau').evaluate(b => b.classList.contains('hidden'))));
verifier('le menu ☰ ne propose plus « Gestion » comme une autre application, mais « en plein écran », dans le même onglet (26/09 : sur iPhone installé, un nouvel onglet partait dans Safari sans la session)', /plein écran/.test(await page.locator('#lien-gestion').textContent()) && (await page.locator('#lien-gestion').getAttribute('target')) === null);
verifier('avant l\'ouverture, aucun cadre n\'est chargé (Gestion ne se charge pas pour rien)', (await page.locator('#bureau-cadre-hote iframe').count()) === 0);
await page.locator('#eqtab-btn-bureau').click();
await dodo(600);
const cadre = page.locator('#bureau-cadre-hote iframe');
verifier('un cadre gestion.html?integre=1 apparaît, dans une carte « Le Bureau du gérant », avec « Plein écran »', (await cadre.count()) === 1 && /gestion\.html\?integre=1$/.test(await cadre.getAttribute('src')) && /Bureau du gérant/.test(await texte(page.locator('#eqpanel-bureau .bureau-entete'))) && (await page.locator('#eqpanel-bureau a[href="gestion.html"]').count()) === 1);
const frame = page.frameLocator('#bureau-cadre-hote iframe');
await dodo(3500);
const etatCadre = await frame.locator('html').evaluate(h => ({ integre: h.classList.contains('integre'), topbar: (() => { const t = h.querySelector('.topbar'); return t ? getComputedStyle(t).display : 'absente'; })(), dashboard: (() => { const t = h.querySelector('#tab-dashboard'); return t ? getComputedStyle(t).display : 'absent'; })(), retour: (() => { const a = h.querySelector('#settings-dropdown a[href="equipe.html"]'); return a ? a.hidden : 'absent'; })() }));
verifier('dans le cadre, Gestion est ouverte, connectée, SANS sa barre du haut, et « Retour équipe » caché', etatCadre.integre && etatCadre.topbar === 'none' && etatCadre.dashboard !== 'none' && etatCadre.retour === true, JSON.stringify(etatCadre));
const hauteur = await cadre.evaluate(f => Math.round(f.getBoundingClientRect().height));
verifier('le cadre prend la hauteur de l\'écran (au moins 480 px), pas une bande', hauteur >= 480, String(hauteur));

titre('2. Les dix chiffres, en tête du tableau de bord');
const dix = frame.locator('#dix-chiffres');
await dodo(1500);
const tuiles = dix.locator('.dix-tuile');
verifier('dix tuiles, numérotées, chacune avec un verdict', (await tuiles.count()) === 10 && (await texte(tuiles.nth(0))).startsWith('1') && (await dix.locator('.dix-tuile--bon, .dix-tuile--regarder, .dix-tuile--alerte').count()) === 10, String(await tuiles.count()));
verifier('l\'en-tête résume : alertes · à regarder · bons', /alerte/.test(await texte(dix.locator('.dix-sous'))) && /à regarder/.test(await texte(dix.locator('.dix-sous'))));
verifier('le taux d\'échec compte le non livré d\'hier ; l\'échec imputable aussi ; le signalement de trois jours est en alerte', /\d+ %/.test(await texte(tuiles.nth(1))) && /1\)/.test(await texte(tuiles.nth(2))) && (await tuiles.nth(9).evaluate(t => t.classList.contains('dix-tuile--alerte'))), [await texte(tuiles.nth(1)), await texte(tuiles.nth(2)), await texte(tuiles.nth(9))].join(' | '));
verifier('chaque tuile dit où aller dans l\'application de l\'équipe', await tuiles.evaluateAll(ts => ts.every(t => ['suivi', 'retours', 'personnes', 'finances', 'colis', 'programmation'].includes(t.dataset.dixAller))));

titre('3. Une tuile ouvre l\'onglet de l\'équipe, dans la page mère');
await tuiles.nth(9).click();
await dodo(800);
verifier('la tuile « signalements » a ouvert l\'onglet « À traiter » de l\'équipe (postMessage), sans nouvel onglet', await page.locator('#eqpanel-retours').isVisible() && !(await page.locator('#eqpanel-bureau').isVisible()));
await page.locator('#eqtab-btn-bureau').click();
await dodo(500);
verifier('revenir au Bureau ne recharge pas Gestion (le même cadre)', (await page.locator('#bureau-cadre-hote iframe').count()) === 1 && (await frame.locator('#dix-chiffres .dix-tuile').count()) === 10);

titre('4. Sur téléphone, la nuit');
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await dodo(800);
const m = await page.evaluate(() => { const f = document.querySelector('#bureau-cadre-hote iframe'); const r = f.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), deborde: document.documentElement.scrollWidth > window.innerWidth }; });
verifier('le cadre tient dans l\'écran, sans débordement, hauteur utile', !m.deborde && m.w <= 390 && m.h >= 400, JSON.stringify(m));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
