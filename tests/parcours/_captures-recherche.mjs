/* OUTIL — CAPTURES DES BARRES DE RECHERCHE (24/09/2026). Pas un parcours : une lampe.
   Ouvre chaque barre des six espaces avec un mot tapé dedans (donc la croix visible), sur
   téléphone (390) et ordinateur (1440), clair et nuit, et écrit une capture par barre.
   DOSSIER=/tmp/captures-recherche node tests/parcours/_captures-recherche.mjs */
import fs from 'node:fs';
import { ouvrirNavigateur, dodo } from './_navigateur.mjs';
import { nouveauMonde, ADMIN, LIVREUR, CLIENTE1 } from './_monde.mjs';

const DOSSIER = process.env.DOSSIER || '/tmp/captures-recherche';
fs.mkdirSync(DOSSIER, { recursive: true });
const monde = nouveauMonde();
monde.TABLES.boutiques_supervisees.push({ superviseur_id: CLIENTE1, fournisseur_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2' });
const N = await ouvrirNavigateur({ monde });
const page = N.page;
const BARRES = [
  { nom: 'equipe-partout', page: 'equipe.html', qui: ADMIN, avant: () => {}, champ: '#eq-recherche-tout' },
  { nom: 'equipe-colis', page: 'equipe.html', qui: ADMIN, avant: () => showEquipeTab('colis'), champ: '#search-colis' },
  { nom: 'equipe-suivi-clientes', page: 'equipe.html', qui: ADMIN, avant: () => showEquipeTab('suivi'), champ: '#recap-search' },
  { nom: 'equipe-suivi-livreurs', page: 'equipe.html', qui: ADMIN, avant: () => showEquipeTab('suivi'), champ: '#recapl-search' },
  { nom: 'equipe-retours', page: 'equipe.html', qui: ADMIN, avant: () => showEquipeTab('retours'), champ: '#retours-recherche' },
  { nom: 'equipe-comptes', page: 'equipe.html', qui: ADMIN, avant: () => showEquipeTab('comptes'), champ: '#search-comptes' },
  { nom: 'livreur-mes', page: 'livreur.html', qui: LIVREUR, avant: () => { const b = document.getElementById('btn-filtrer-mes'); if (b) b.click(); }, champ: '#search-mes' },
  { nom: 'cliente-colis', page: 'fournisseur.html', qui: CLIENTE1, avant: () => showFournisseurTab('section-colis'), champ: '#search-colis' },
  { nom: 'cliente-boutiques', page: 'fournisseur.html', qui: CLIENTE1, avant: () => showFournisseurTab('section-mes-boutiques'), champ: '#mb-recherche' },
  { nom: 'equipe-personnes-clientes', page: 'equipe.html', qui: ADMIN, avant: () => showEquipeTab('clients'), champ: '#cd-recherche' },
  { nom: 'equipe-personnes-livreurs', page: 'equipe.html', qui: ADMIN, avant: () => showEquipeTab('livreurs'), champ: '#ld-recherche' },
];
for (const largeur of [390, 1440]) {
  for (const nuit of [false, true]) {
    await page.emulateMedia({ colorScheme: nuit ? 'dark' : 'light' });
    await page.setViewportSize({ width: largeur, height: largeur < 500 ? 844 : 900 });
    for (const b of BARRES) {
      try {
        await N.ouvrirConnecte(b.page, b.qui); await dodo(1800);
        if (nuit) await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
        await page.evaluate(b.avant); await dodo(900);
        const champ = page.locator(b.champ).first();
        if (!(await champ.count())) { console.log('  (absent) ' + b.nom + ' ' + b.champ); continue; }
        await champ.scrollIntoViewIfNeeded(); await champ.click(); await page.keyboard.type('ma'); await dodo(700);
        await page.screenshot({ path: `${DOSSIER}/${b.nom}--${largeur}${nuit ? '--nuit' : ''}.png` });
      } catch (e) { console.log('  (raté) ' + b.nom + ' : ' + String(e).split('\n')[0].slice(0, 120)); }
    }
  }
}
console.log('captures dans', DOSSIER);
await N.fermer();
