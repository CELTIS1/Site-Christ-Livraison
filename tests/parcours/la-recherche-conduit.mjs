/* PARCOURS 11 — LA RECHERCHE CONDUIT QUELQUE PART (18 septembre 2026, au soir)
   ==========================================================================================
   Celtis : « la barre de recherche du compte équipe ne sert à rien. J'ai mis Aloha, la cliente
   Aloha Shop. Ça me suggère, je clique dessus, ça m'envoie dans le compte, mais ça ne m'envoie
   pas là où il faut. Ça ne me présente pas ses colis, ça ne me présente pas son compte. Ça sert
   à quoi alors ? »

   IL AVAIT RAISON, ET LE DÉFAUT ÉTAIT DE CONCEPTION. Une personne trouvée était conduite vers
   l'onglet COMPTES — l'écran d'administration (valider, créer, suspendre) — et on s'y contentait
   de RECOPIER SON NOM dans le champ de filtre. Deux erreurs dans un seul geste :

     1. Comptes n'est pas l'écran d'une cliente. Ce qu'on cherche en tapant son nom, c'est sa
        FICHE : son téléphone, ses colis, ce qu'on lui doit, le bouton pour la reverser.
     2. On recopiait le TEXTE au lieu d'emmener l'IDENTIFIANT, que la base renvoie pourtant. Un
        filtre par nom échoue dès que le nom affiché diffère de celui que le filtre compare —
        exactement le cas d'une cliente qui a un nom de boutique.

   CE PARCOURS TIENT LA PROMESSE : chercher quelqu'un mène à SA fiche, chercher un colis mène à
   CE colis, et « Ses colis » mène à ses colis. Une recherche qui n'aboutit nulle part ne sert
   à rien — c'est la phrase de Celtis, et c'est le contrôle.

   Lancer à la main :  node tests/parcours/la-recherche-conduit.mjs */

import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { ADMIN } from './_monde.mjs';

const N = await ouvrirNavigateur();
const { page, erreurs } = N;
const champ = () => page.locator('#eq-recherche-tout');
const resultats = () => page.locator('#eq-recherche-resultats');

await N.ouvrirConnecte('equipe.html', ADMIN);
await page.setViewportSize({ width: 1300, height: 950 });
await dodo(3000);

titre('1. On cherche une cliente par son nom');
await champ().fill('Awa');
await dodo(1800);
const texte = await resultats().innerText();
verifier('elle est trouvée, et rangée sous « Personnes »',
  /PERSONNES/i.test(texte) && /Awa Boutique/.test(texte), texte.replace(/\n/g, ' | '));
/* On la cherche pour deux raisons — savoir où elle en est, ou voir ce qu'elle nous a confié.
   Deviner laquelle se trompe une fois sur deux : on propose les deux. */
verifier('deux gestes lui sont proposés : sa fiche, et ses colis',
  (await page.locator('.recherche-ligne--cote').count()) === 1);

titre('2. Cliquer sur son nom ouvre SA fiche — pas l\'écran des comptes');
await page.evaluate(() => {
  const b = [...document.querySelectorAll('#eq-recherche-resultats .recherche-ligne')]
    .find((x) => /Awa/.test(x.textContent || '') && !x.classList.contains('recherche-ligne--cote'));
  if (b) b.click();
});
await dodo(2500);
verifier('on arrive sur Personnes',
  /Personnes/.test(await page.locator('#clt-toptabs .clt-toptab.active').innerText()),
  await page.locator('#clt-toptabs .clt-toptab.active').innerText());
verifier('et sa fiche est ouverte',
  await page.evaluate(() => { const o = document.getElementById('cd-fiche-overlay'); return !!o && !o.classList.contains('hidden'); }));
verifier('c\'est bien la sienne, nommée',
  (await page.locator('#cd-fiche-corps .cd-fiche-nom').innerText()).includes('Awa'),
  await page.locator('#cd-fiche-corps .cd-fiche-nom').innerText());
/* Ce que Celtis cherchait : son contact, ses chiffres, son argent. Ils sont sur cette fiche —
   c'est l'écran qui existait déjà, et vers lequel la recherche ne conduisait pas. */
const corps = await page.locator('#cd-fiche-corps').innerText();
verifier('on y trouve son contact et ce qu\'on lui doit',
  /CONTACT/i.test(corps) && /reverser/i.test(corps), corps.slice(0, 160).replace(/\n/g, ' | '));

titre('3. « Ses colis » conduit à ses colis');
await page.evaluate(() => { const o = document.getElementById('cd-fiche-overlay'); if (o) o.classList.add('hidden'); });
await champ().fill('Awa');
await dodo(1800);
await page.evaluate(() => { const b = document.querySelector('.recherche-ligne--cote'); if (b) b.click(); });
await dodo(2000);
verifier('on arrive sur l\'onglet Colis',
  /Colis/.test(await page.locator('#clt-toptabs .clt-toptab.active').innerText()),
  await page.locator('#clt-toptabs .clt-toptab.active').innerText());
/* Le filtre reçoit le nom que la LISTE sait comparer (le nom de boutique), pas celui que la
   recherche affiche. Les deux diffèrent dès qu'une cliente a une boutique — et c'est ce qui
   rendait la liste vide. */
const q = await page.locator('#search-colis').inputValue();
verifier('avec son nom posé dans le filtre de la liste', q.length > 0, q);
const n = await page.locator('#colis-list .colis-item').count();
verifier('et des colis à l\'écran, pas une liste vide', n > 0, String(n));

titre('4. On cherche un colis par son numéro');
// Le numéro est lu sur une carte affichée : `allColis` est une variable de module, pas une
// propriété de window — la lire de l'extérieur rendrait vide sans rien dire.
const numero = await page.evaluate(() => {
  const c = document.querySelector('#colis-list .colis-item[data-numero]');
  return c ? c.getAttribute('data-numero') : '';
});
verifier('on a un numéro de colis sous la main pour la suite', !!numero, numero);
await champ().fill(numero.slice(-8));
await dodo(1800);
verifier('il est trouvé, sous « Colis »', /COLIS/i.test(await resultats().innerText()),
  (await resultats().innerText()).replace(/\n/g, ' | '));
await page.evaluate(() => { const b = document.querySelector('#eq-recherche-resultats .recherche-ligne'); if (b) b.click(); });
await dodo(2200);
verifier('la liste se place dessus', (await page.locator('#search-colis').inputValue()).length > 0);
/* Filtrer ne suffit pas : sur plusieurs lignes, « c'est lequel ? » est la question suivante.
   Le colis trouvé est surligné, comme ceux des pastilles de « L'essentiel ». */
verifier('et le colis trouvé est surligné, pas seulement filtré',
  (await page.locator('#colis-list .colis-item.colis-a-voir').count()) >= 1,
  String(await page.locator('#colis-list .colis-item').count()) + ' colis affichés');

titre('5. Rien n\'a cassé');
verifier('aucune erreur JavaScript sur tout le parcours', erreurs.length === 0, erreurs.join('\n       '));

await N.fermer();
process.exit(bilan());
