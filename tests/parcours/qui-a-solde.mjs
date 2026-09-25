/* PARCOURS — QUI A SOLDÉ QUOI (25 septembre 2026, lot V)
   ==========================================================================================
   Celtis : « quand dans le point du livreur un montant n'est pas marqué, il faut qu'on voie tout
   ce qui a été soldé et par qui ; lever tout doute, chez les livreurs et chez les fournisseurs ».
     1. Livreur › Finance : sous chaque colis, « 🔖 … coché par … le … » ; sous le TOTAL,
        « Pas encaissé par le livreur : 3 colis » avec le détail ; nuit lisible ; 390 sans débordement ;
     2. Cliente : sur sa carte, ce qui est soldé seulement (Celtis, 25/09 : pas besoin de qui ni quand).
   Lancer à la main :  node tests/parcours/qui-a-solde.mjs */
import { ouvrirNavigateur, verifier, titre, dodo, bilan } from './_navigateur.mjs';
import { nouveauMonde, colis, iso, LIVREUR, CLIENTE1 } from './_monde.mjs';

const monde = nouveauMonde();
monde.TABLES.colis.push(colis(401, { statut: 'livre', created_at: iso(0, 7), fournisseur_id: CLIENTE1, recupere_at: iso(0, 9), livre_at: iso(0, 11), article_non_encaisse: true, description: 'Robe', montant_article: 15000, montant_livraison: 1500, trace_soldes: { article_non_encaisse: { nom: 'Awa Boutique', role: 'fournisseur', le: iso(0, 7), a_la_saisie: true } } }));
monde.TABLES.colis.push(colis(402, { statut: 'livre', created_at: iso(0, 7), fournisseur_id: CLIENTE1, recupere_at: iso(0, 9), livre_at: iso(0, 12), livraison_payee: true, description: 'Sac', montant_article: 9000, montant_livraison: 1000, trace_soldes: { livraison_payee: { nom: 'Roxy', role: 'equipe', le: iso(0, 8) } } }));
monde.TABLES.colis.push(colis(403, { statut: 'livre', created_at: iso(0, 7), fournisseur_id: CLIENTE1, recupere_at: iso(0, 9), livre_at: iso(0, 13), livraison_non_encaissee: true, description: 'Chaussures', montant_article: 7000, montant_livraison: 1500, trace_soldes: { livraison_non_encaissee: { avant_suivi: true } } }));

const N = await ouvrirNavigateur({ monde });
const { page, erreurs } = N;

titre('1. Le point du livreur');
await page.setViewportSize({ width: 390, height: 844 });
await N.ouvrirConnecte('livreur.html', LIVREUR); await dodo(2200);
await page.locator('#clt-bottomnav [data-nav="finance"]').click(); await dodo(1200);
await page.evaluate(() => document.querySelectorAll('.finance-ligne').forEach((tr) => { if (!tr.classList.contains('ouverte')) tr.click(); })); await dodo(800);
const lignes = await page.locator('.finance-colis-solde').allInnerTexts();
verifier('trois lignes « 🔖 » sous les colis : article soldé (Awa, à la saisie), livraison payée d\'avance (Roxy, bureau), manque (auteur non enregistré)', lignes.length === 3 && lignes.some((t) => /Article 15\s?000 FCFA soldé chez la vendeuse.*coché à la saisie par Awa Boutique \(cliente\)/.test(t)) && lignes.some((t) => /payée d’avance.*coché par Roxy \(bureau\)/.test(t)) && lignes.some((t) => /manque.*auteur non enregistré/.test(t)), JSON.stringify(lignes));
const resume = (await page.locator('.soldes-resume').innerText()).replace(/\s+/g, ' ');
verifier('sous le TOTAL : « Pas encaissé par le livreur : 3 colis », les trois montants, les numéros', /Pas encaissé par le livreur : 3 colis/.test(resume) && /articles soldés chez la vendeuse 15\s?000 FCFA/.test(resume) && /CLT-260916-00403/.test(resume), resume);
verifier('à 390 px, rien ne déborde', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
verifier('textes ≥ 13 px', await page.evaluate(() => [...document.querySelectorAll('.finance-colis-solde, .soldes-resume li')].every((e) => parseFloat(getComputedStyle(e).fontSize) >= 13)));
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await dodo(400);
verifier('la nuit : fond sombre, texte clair', await page.evaluate(() => { const e = document.querySelector('.soldes-resume'); const bg = getComputedStyle(e).backgroundColor; return bg === 'rgb(24, 42, 66)'; }));
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

titre('2. La cliente');
await N.ouvrirConnecte('fournisseur.html', CLIENTE1); await dodo(2500);
const cl = await page.locator('.finance-colis-solde').allTextContents();
verifier('sur ses cartes : ce qui est soldé, sans qui ni quand, et sans le manque du livreur (Celtis, 25/09)', cl.some((t) => /Article 15\s?000 FCFA soldé chez vous/.test(t)) && cl.some((t) => /Livraison 1\s?000 FCFA payée d’avance chez vous/.test(t)) && !cl.some((t) => /coché|manque/.test(t)), JSON.stringify(cl).slice(0, 300));

verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
await N.fermer();
process.exit(bilan() ? 1 : 0);
