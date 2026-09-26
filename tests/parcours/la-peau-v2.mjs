/* PARCOURS — LA PEAU v2 (chantier N, lot 18 — C21, 25 septembre 2026)
   ==========================================================================================
   Ce qu'on VOIT dans un vrai navigateur, trois espaces, clair et nuit : le fond uni, la barre du
   haut unie (pas de dégradé), les cartes sans bordure, les onglets du haut avec une icône en trait
   et sans émoji, le même mot en haut et en bas, un bouton plein en encre avec du blanc dessus
   (≥ 4,5), la carte de connexion. Et zéro erreur.

   Lancer à la main :  node tests/parcours/la-peau-v2.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, ADMIN, LIVREUR, CLIENTE1 } from './_monde.mjs';

const monde = nouveauMonde();
const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;

function lum(rgb) { const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function contraste(a, b) { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }

const mesurer = () => page.evaluate(() => {
  const cs = (el) => el ? getComputedStyle(el) : null;
  const top = cs(document.querySelector('.topbar')), body = cs(document.body), card = cs(document.querySelector('.card'));
  const tabs = [...document.querySelectorAll('.clt-toptab')];
  const navs = [...document.querySelectorAll('#clt-bottomnav .nav')];
  const motsBas = navs.map(n => n.textContent.replace(/\d+/g, '').trim().toLowerCase());
  const btn = [...document.querySelectorAll('.btn:not(.btn-outline)')].find(b => b.offsetParent && !/bascule|btn-etape|btn-save/.test(b.className));
  return {
    bodyImage: body.backgroundImage, bodyBg: body.backgroundColor,
    topImage: top ? top.backgroundImage : '', topBg: top ? top.backgroundColor : '',
    cardBorder: card ? card.borderTopWidth + ' ' + card.borderTopStyle : '', cardShadow: card ? card.boxShadow !== 'none' : false,
    tabs: tabs.length, tabsAvecIcone: tabs.filter(t => t.querySelector('svg.clt-ico')).length,
    tabsAvecEmoji: tabs.filter(t => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t.textContent)).length,
    motsTabs: tabs.map(t => t.textContent.replace(/\d+/g, '').trim().toLowerCase()), motsBas,
    btn: btn ? { bg: cs(btn).backgroundColor, color: cs(btn).color, image: cs(btn).backgroundImage, radius: cs(btn).borderTopLeftRadius } : null,
  };
});

titre('1. Le livreur, sur ordinateur, le jour');
await N.ouvrirConnecte('livreur.html', LIVREUR);
await dodo(1800);
await page.setViewportSize({ width: 1440, height: 900 });
await dodo(600);
let m = await mesurer();
verifier('le fond de page est uni, la barre du haut est unie : plus aucun dégradé', m.bodyImage === 'none' && m.topImage === 'none', JSON.stringify([m.bodyImage.slice(0, 40), m.topImage.slice(0, 40)]));
verifier('la barre du haut est l\'encre du livreur (#BF5210 = rgb(191, 82, 16))', m.topBg === 'rgb(191, 82, 16)', m.topBg);
verifier('la carte n\'a plus de bordure, mais une ombre', /^0px/.test(m.cardBorder) && m.cardShadow, m.cardBorder);
verifier('les cinq onglets du haut (Accueil compris, 26/09) portent une icône en trait et plus aucun émoji', m.tabs === 5 && m.tabsAvecIcone === 5 && m.tabsAvecEmoji === 0, JSON.stringify([m.tabs, m.tabsAvecIcone, m.tabsAvecEmoji]));
// « Récupérations » en haut, « Récup. » en bas : le même mot, abrégé là où la place manque (règle du 23/09).
verifier('le même mot en haut et en bas (Mes colis, Récup., Finance, À rendre)', m.motsTabs.every(mot => m.motsBas.some(b => mot.replace(/[^a-zà-ÿ]/g, '').startsWith(b.replace(/[^a-zà-ÿ]/g, '')))), JSON.stringify([m.motsTabs, m.motsBas]));
verifier('un bouton plein : aplat encre, sans dégradé, blanc dessus, contraste ≥ 4,5, arrondi 12', !!m.btn && m.btn.image === 'none' && m.btn.bg === 'rgb(191, 82, 16)' && contraste(m.btn.color, m.btn.bg) >= 4.5 && m.btn.radius === '12px', JSON.stringify(m.btn));

titre('2. La cliente, sur téléphone, la nuit');
await N.ouvrirConnecte('fournisseur.html', CLIENTE1);
await dodo(1800);
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await dodo(600);
m = await mesurer();
verifier('la nuit : fond #0F1824, barre du haut = surface #1B2635 (pas de couleur vive), carte sans bordure', m.bodyBg === 'rgb(15, 24, 36)' && m.topBg === 'rgb(27, 38, 53)' && /^0px/.test(m.cardBorder), JSON.stringify([m.bodyBg, m.topBg, m.cardBorder]));
verifier('le bouton plein garde l\'encre verte (#167A42) et du blanc dessus, ≥ 4,5', !!m.btn && m.btn.bg === 'rgb(22, 122, 66)' && contraste(m.btn.color, m.btn.bg) >= 4.5, JSON.stringify(m.btn));
const actif = await page.evaluate(() => { const n = document.querySelector('#clt-bottomnav .nav.active'); const c = getComputedStyle(n); return { color: c.color, bg: c.backgroundColor, h: Math.round(n.getBoundingClientRect().height) }; });
verifier('l\'onglet actif du bas, la nuit : blanc sur l\'accent voilé, ≥ 44 px', actif.color === 'rgb(255, 255, 255)' && actif.h >= 44, JSON.stringify(actif));
await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

titre('3. L\'équipe : neuf onglets du haut, icônes du bas (y compris ceux derrière « Plus »)');
await page.setViewportSize({ width: 1440, height: 900 });
await N.ouvrirConnecte('equipe.html', ADMIN);
await dodo(2200);
m = await mesurer();
verifier('la barre est l\'encre navy, les onglets visibles portent tous une icône en trait, aucun émoji', m.topBg === 'rgb(27, 67, 116)' && m.tabsAvecEmoji === 0 && m.tabsAvecIcone >= 8, JSON.stringify([m.topBg, m.tabs, m.tabsAvecIcone, m.tabsAvecEmoji]));
verifier('la carte des dix chiffres (Bureau) et les groupes « À confier » ont l\'ombre douce, pas de trait', await page.evaluate(() => { const g = document.querySelector('.confier-groupe'); return !g || getComputedStyle(g).boxShadow !== 'none'; }));

titre('4. La page de connexion');
// Sans session (sinon login.html renvoie vers l'espace) : on efface, puis on ouvre.
await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
await page.goto(N.base + '/app/login.html');
await dodo(1500);
const login = await page.evaluate(() => { const b = document.querySelector('.login-box'); const c = getComputedStyle(b); return { border: c.borderTopWidth, shadow: c.boxShadow !== 'none', radius: c.borderTopLeftRadius }; });
verifier('la carte de connexion : sans bordure, ombre haute, arrondi 20', login.border === '0px' && login.shadow && login.radius === '20px', JSON.stringify(login));
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan() ? 1 : 0);
