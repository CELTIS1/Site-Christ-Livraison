/* PARCOURS 10 — RIEN NE DÉBORDE DE L'ÉCRAN (18 septembre 2026, au soir)
   ==========================================================================================
   Celtis, photos d'écran à l'appui : « il y a des écrans qui débordent, des écritures qui
   dépassent les lignes et des tableaux qui débordent ».

   CE QUE MONTRAIENT SES PHOTOS : sa fiche cliente, coupée à GAUCHE. « ient particulier »,
   « ougon · cliente depuis », « erser · 1000 FCFA ». Pas une ligne trop longue : la fiche
   ENTIÈRE décalée de côté.

   LA CAUSE, trouvée en mesurant plutôt qu'en regardant : les deux tableaux de la fiche font
   472 et 635 px sur un écran de 390. Et `overflow-y:auto` sans `overflow-x` déclaré vaut, en
   CSS, `overflow-x:auto` — le corps de la fiche était donc lui-même le défileur horizontal.
   Pousser le tableau du doigt emportait tout le reste avec lui.

   POURQUOI CE PARCOURS EXISTE. Un débordement ne casse rien : la page s'affiche, les chiffres
   sont justes, les bancs d'essai restent verts. Il ne se voit qu'à l'œil, sur un vrai
   téléphone, et seulement si l'on pense à faire défiler de côté. C'est exactement le genre de
   défaut qui vit des mois — et celui-ci rendait une fiche illisible.

   CE QU'IL MESURE, écran par écran, à 360 px de large : tout élément plus large que l'écran,
   ou qui en sort, SAUF s'il est rangé dans une boîte faite pour défiler horizontalement (la
   rangée de filtres, .g-table-wrap, .cd-defile). Un conteneur qui défile AUSSI verticalement
   n'en est pas une : c'est précisément le piège ci-dessus.

   Lancer à la main :  node tests/parcours/rien-ne-deborde.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN, LIVREUR, CLIENTE1, CLIENT_EXPRESS } from './_monde.mjs';

const LARGEUR = 360;   // plus étroit que l'iPhone de Celtis : ce qui passe ici passe partout
const N = await ouvrirNavigateur();
const { page, erreurs } = N;

const mesurer = () => page.evaluate(() => {
  const L = document.documentElement.clientWidth;
  const trouves = [];
  document.querySelectorAll('body *').forEach((e) => {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return;
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
      const c2 = getComputedStyle(a);
      const ox = c2.overflowX;
      /* Un VRAI défileur horizontal ne défile QUE de côté. Un conteneur qui défile aussi en
         hauteur — le corps d'une fiche — n'en est pas un : y pousser un tableau emporte toute
         la fiche. On regarde s'il défile RÉELLEMENT en hauteur, pas ce que le style déclare,
         parce que CSS impose overflow-x:auto dès qu'on écrit overflow-y:auto. */
      if ((ox === 'auto' || ox === 'scroll') && a.scrollHeight <= a.clientHeight + 2) return;
      if (c2.overflowX === 'hidden') return;   // déjà borné : rien n'en sort
    }
    if (r.width > L + 1 || r.right > L + 1 || r.left < -1) {
      if (trouves.some((v) => v.el.contains(e))) return;   // le plus haut fautif suffit
      trouves.push({ el: e, t: (e.id ? '#' + e.id : e.tagName)
        + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : '')
        + ' (' + Math.round(r.width) + 'px)' });
    }
  });
  return trouves.slice(0, 8).map((v) => v.t);
});

async function ecran(nom, avant) {
  if (avant) await avant();
  await page.setViewportSize({ width: LARGEUR, height: 780 });
  await dodo(1600);
  const d = await mesurer();
  verifier(nom, d.length === 0, d.join(' · '));
}

titre('1. Les écrans que nos clients ont dans la poche');
await N.ouvrirConnecte('livreur.html', LIVREUR);
await ecran("l'écran du livreur");
await N.ouvrirConnecte('fournisseur.html', CLIENTE1);
await ecran("l'écran de la cliente");
await N.ouvrirConnecte('express-client.html', CLIENT_EXPRESS);
await ecran("CLT Express, côté client");

titre('2. Le bureau, onglet par onglet');
await N.ouvrirConnecte('equipe.html', ADMIN);
for (const o of ['colis', 'programmation', 'suivi', 'personnes', 'finances', 'comptes']) {
  await ecran('Équipe › ' + o, () => page.evaluate((k) => showEquipeTab(k), o));
}

titre('3. Les fiches qui s\'ouvrent par-dessus — le défaut du 18/09 était là');
await ecran('la fiche d\'une cliente', async () => {
  await page.evaluate(() => showEquipeTab('personnes'));
  await dodo(2200);
  await page.evaluate(() => { const b = document.querySelector('[data-cd-fiche]'); if (b) b.click(); });
});
/* La fiche porte deux tableaux plus larges que l'écran : ils DOIVENT rester consultables.
   Les borner sans leur donner de quoi défiler aurait remplacé un défaut par un autre. */
verifier('et ses tableaux restent consultables : ils défilent dans leur propre boîte',
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('#cd-fiche-corps table.cd-mini')];
    return t.length > 0 && t.every((x) => {
      const b = x.closest('.cd-defile');
      return b && b.scrollWidth > b.clientWidth - 2;
    });
  }));
verifier('le corps de la fiche, lui, ne bouge plus de côté',
  await page.evaluate(() => {
    const c = document.getElementById('cd-fiche-corps');
    return !!c && getComputedStyle(c).overflowX === 'hidden';
  }));

titre('4. La gestion');
await N.ouvrirConnecte('gestion.html', ADMIN);
await ecran('Gestion › tableau de bord');
await ecran('Gestion › comptabilité', () => page.evaluate(() => switchTab('compta')));
await ecran('Gestion › paie', () => page.evaluate(() => switchTab('paie')));

verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));
await N.fermer();
process.exit(bilan());
