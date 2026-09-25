/* PARCOURS — GESTION : REPLIER, DÉPLIER, CHERCHER UN ÉCRAN (26 septembre 2026)
   ==========================================================================================
   Sur un ordinateur : les cartes longues du tableau de bord sont repliées, les trois qui appellent un
   geste sont ouvertes ; la barre latérale n'ouvre que l'onglet courant ; « éché » + Entrée ouvre
   l'Échéancier ; les états survivent au rechargement. Sur téléphone : le champ au-dessus des onglets.

   Lancer à la main :  node tests/parcours/gestion-replier.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, ADMIN } from './_monde.mjs';

const monde = nouveauMonde();
const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;

titre('1. Ordinateur : la page raccourcie, les cartes repliées');
await page.setViewportSize({ width: 1440, height: 900 });
await N.ouvrirConnecte('gestion.html', ADMIN);
await dodo(4500);
const a = await page.evaluate(() => ({ hauteur: document.body.scrollHeight, pliees: [...document.querySelectorAll('#sec-dashboard .card--plie')].map((c) => c.id), ouvertes: [...document.querySelectorAll('#sec-dashboard .card--pliable:not(.card--plie)')].map((c) => c.id), chevron: Math.round((document.querySelector('.card-pli') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height) }));
verifier('les dix chiffres, les rapports reçus et « À faire par le gérant » sont ouverts ; les analyses longues sont repliées', a.ouvertes.join() === 'dix-chiffres,rap-carte,af-carte' && a.pliees.includes('cdd-console') && a.pliees.includes('cdd-questions'), JSON.stringify(a));
verifier('la page fait moins de la moitié de sa longueur d\'avant (6 200 px) ; chevron de 44 px', a.hauteur < 3100 && a.chevron === 44, JSON.stringify(a));
await page.evaluate(() => document.querySelector('#cdd-console .card-pli').click()); await dodo(300);
verifier('un appui déplie la carte', await page.evaluate(() => !document.getElementById('cdd-console').classList.contains('card--plie')));

titre('2. La barre latérale : un seul onglet ouvert, la recherche');
const blocs = () => page.evaluate(() => [...document.querySelectorAll('.gbl-tete')].map((t) => t.querySelector('.gbl-onglet').dataset.gblTab + ':' + (t.classList.contains('gbl-tete--plie') ? 'plie' : 'ouvert')).join(' '));
verifier('seul le Tableau de bord (courant) est déplié ; Comptabilité, Paie… repliés', /dashboard:ouvert/.test(await blocs()) && /compta:plie paie:plie/.test(await blocs()), await blocs());
await page.click('#gbl-champ'); await page.keyboard.type('éché'); await dodo(400);
verifier('« éché » : la liste ne montre plus que Échéancier, et le clavier garde la main', (await page.evaluate(() => [...document.querySelectorAll('#gbl-barre .gbl-item')].map((i) => i.textContent.trim()).join())) === 'Échéancier' && await page.evaluate(() => document.activeElement && document.activeElement.id === 'gbl-champ'));
await page.keyboard.press('Enter'); await dodo(800);
verifier('Entrée ouvre Comptabilité › Échéancier, la recherche s\'efface, le bloc Comptabilité se déplie', await page.evaluate(() => document.querySelector('.tabs .tab.active').dataset.tab === 'compta' && document.querySelector('#sec-compta .subtab.active').dataset.sub === 'echeances' && document.getElementById('gbl-champ').value === '') && /compta:ouvert/.test(await blocs()), await blocs());
await page.evaluate(() => document.querySelector('[data-gbl-pli="paie"]').click()); await dodo(300);
verifier('le chevron de Paie le déplie sans changer d\'écran', /paie:ouvert/.test(await blocs()) && await page.evaluate(() => document.querySelector('.tabs .tab.active').dataset.tab === 'compta'));

titre('3. Après rechargement, les états sont retenus');
await page.reload(); await dodo(4500);
verifier('la console (dépliée) et Paie (déplié) le sont encore', await page.evaluate(() => !document.getElementById('cdd-console').classList.contains('card--plie')) && /paie:ouvert/.test(await blocs()), await blocs());

titre('4. Téléphone : le champ au-dessus des onglets');
await page.setViewportSize({ width: 390, height: 844 }); await dodo(600);
await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('dashboard'); }); await dodo(500);
verifier('le champ est là (44 px), la barre latérale non', await page.evaluate(() => { const c = document.getElementById('gm-champ'); return !!c && Math.round(c.getBoundingClientRect().height) === 44 && getComputedStyle(document.querySelector('.gm-recherche')).display !== 'none' && !document.body.classList.contains('gbl-active'); }));
await page.fill('#gm-champ', 'paie'); await dodo(300);
const res = await page.evaluate(() => [...document.querySelectorAll('.gm-res')].map((b) => b.textContent.trim()));
verifier('« paie » → Paie › Saisie du mois, Bulletins…', res.length >= 3 && /Paie › /.test(res[0]), res.join(' | '));
await page.evaluate(() => document.querySelector('.gm-res').click()); await dodo(600);
verifier('un résultat ouvre l\'écran', await page.evaluate(() => document.querySelector('.tabs .tab.active').dataset.tab === 'paie'));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
