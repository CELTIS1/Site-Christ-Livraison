/* LA CHAÎNE DE L'ARGENT, COLIS PAR COLIS (20/09/2026, feuille de route 10.1)
   La règle (app/chaine-de-l-argent.js) est exécutée pour de vrai, branchée sur LA VRAIE addition
   de la maison (lib/argent.js, chargée par le harnais) : ce banc prouve que les quatre états
   disent la même chose que le relevé de la cliente et la caisse du livreur, y compris sur les
   cas qui ont déjà coûté cher — l'expédition, l'article soldé chez le fournisseur, l'échec.
   Lancer à la main :  node tests/la-chaine-de-l-argent.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerApp } from './_charger-app.mjs';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400) : '')); } }

const app = chargerApp({ page: 'equipe.html' });
const ctx = app.__contexte;
const source = lire('app/chaine-de-l-argent.js');
vm.runInContext(source, ctx);
const C = app.__fenetre.window.CLTChaineArgent;
const R = vm.runInContext('({ articleEncaisse: articleEncaisse, montantArticleColis: montantArticleColis, estExpedition: estExpedition, montantArticleADevoir: montantArticleADevoir, COMMUNE_EXPEDITION: COMMUNE_EXPEDITION })', ctx);

const MAINTENANT = Date.parse('2026-09-20T12:00:00Z');
const il = (j) => new Date(MAINTENANT - j * 86400000).toISOString();
let n = 0;
const c = (o) => Object.assign({ id: 'c' + (++n), numero: 'CLT-' + n, statut: 'livre', fournisseur_id: 'F1', livreur_id: 'L1', commune_destination: 'Cocody',
  montant_article: 10000, montant_livraison: 1500, montant: 11500, article_non_encaisse: false, encaissement_remis: false, created_at: il(6) }, o);

console.log('\n1. Les quatre états, un colis chacun');
verifier('en route (en attente, récupéré, en livraison) : À ENCAISSER', ['en_attente', 'recupere', 'en_livraison'].every((s) => C.etatDe(c({ statut: s }), R) === 'a_encaisser'));
verifier('livré, caisse non remise : CHEZ LE LIVREUR', C.etatDe(c({ livre_at: il(1) }), R) === 'chez_livreur');
verifier('livré, caisse remise, pas reversé : EN CAISSE', C.etatDe(c({ livre_at: il(2), encaissement_remis: true, encaissement_remis_at: il(1) }), R) === 'en_caisse');
verifier('reversé à la cliente : REVERSÉ', C.etatDe(c({ livre_at: il(2), encaissement_remis: true, reverse_au_fournisseur_at: il(0) }), R) === 'reverse');

console.log('\n2. Ce qui n\'est PAS de l\'argent à suivre — les règles de la maison, pas les miennes');
verifier('un échec, un retour : rien', C.etatDe(c({ statut: 'non_livre' }), R) === '' && C.etatDe(c({ statut: 'retour' }), R) === '');
verifier('un article à zéro : rien', C.etatDe(c({ montant_article: 0 }), R) === '');
verifier('« article déjà soldé chez le fournisseur » : rien, livré ou en route', C.etatDe(c({ article_non_encaisse: true }), R) === '' && C.etatDe(c({ statut: 'en_livraison', article_non_encaisse: true }), R) === '');
verifier('une expédition (payée chez la vendeuse) : rien', C.etatDe(c({ commune_destination: R.COMMUNE_EXPEDITION }), R) === '' && C.etatDe(c({ statut: 'en_livraison', commune_destination: R.COMMUNE_EXPEDITION }), R) === '');
verifier('un ancien colis sans détail : son montant unique est l\'article (comme partout)', C.etatDe(c({ montant_article: null, montant_livraison: null, montant: 8000 }), R) === 'chez_livreur');

console.log('\n3. La chaîne entière, et l\'accord avec le relevé de la cliente');
const colis = [
  c({ statut: 'en_livraison', recupere_at: il(1), montant_article: 20000 }),
  c({ livre_at: il(5), montant_article: 25000 }),
  c({ livre_at: il(0.2), livreur_id: 'L2', montant_article: 5000 }),
  c({ livre_at: il(3), encaissement_remis: true, encaissement_remis_at: il(2), fournisseur_id: 'F2', montant_article: 12000 }),
  c({ livre_at: il(2), encaissement_remis: true, reverse_au_fournisseur_at: il(0.1), montant_article: 9000 }),
  c({ livre_at: il(1), encaissement_remis: false, reverse_au_fournisseur_at: il(0.1), montant_article: 7000 }),
  c({ livre_at: il(9), encaissement_remis: true, reverse_au_fournisseur_at: il(4), montant_article: 99000 }),
  c({ statut: 'non_livre', montant_article: 50000 }),
];
const ch = C.chaine(colis, R, { maintenant: MAINTENANT, jour: '2026-09-20' });
const E = Object.fromEntries(ch.etats.map((e) => [e.cle, e]));
verifier('quatre cases, dans l\'ordre où l\'argent voyage', ch.etats.map((e) => e.cle).join() === 'a_encaisser,chez_livreur,en_caisse,reverse');
verifier('à encaisser 20 000 (1) · chez le livreur 30 000 (2) · en caisse 12 000 (1)', E.a_encaisser.montant === 20000 && E.chez_livreur.montant === 30000 && E.chez_livreur.nb === 2 && E.en_caisse.montant === 12000, ch.etats.map((e) => e.montant));
verifier('reversé : seulement celui du jour choisi (16 000), pas les 99 000 d\'il y a quatre jours', E.reverse.montant === 16000 && E.reverse.nb === 2);
verifier('« chez le livreur » + « en caisse » = ce que la maison DOIT aux clientes (montantArticleADevoir)', E.chez_livreur.montant + E.en_caisse.montant === colis.reduce((s, x) => s + R.montantArticleADevoir(x), 0));
verifier('le plus ancien d\'abord : 5 jours chez le livreur', E.chez_livreur.plusVieux === 5 && E.chez_livreur.colis[0].jours === 5 && E.chez_livreur.colis[1].jours === 0);
verifier('l\'âge se compte depuis le bon moment : la livraison, puis la remise', E.en_caisse.colis[0].jours === 2);
verifier('un autre jour : on voit SON reversé (99 000), le stock ne change pas', (() => { const a = C.chaine(colis, R, { maintenant: MAINTENANT, jour: '2026-09-16' }); const r = a.etats[3]; return r.montant === 99000 && a.etats[1].montant === 30000; })());

console.log('\n4. L\'anomalie que seule la chaîne fait voir');
verifier('reversé alors que le livreur n\'a pas remis : CLT a avancé 7 000 F, et c\'est dit', ch.avances.length === 1 && ch.avances[0].montant === 7000);

console.log('\n5. Par personne');
const gens = C.parPersonne(E.chez_livreur.colis, (l) => l.livreur_id);
verifier('qui doit remettre : L1 25 000 (depuis 5 jours), L2 5 000 — le plus gros d\'abord', gens.map((g) => g.id + ':' + g.montant + ':' + g.plusVieux).join() === 'L1:25000:5,L2:5000:0', gens);

console.log('\n6. La frontière et le branchement');
const nu = source.replace(/\/\*[\s\S]*?\*\//g, '');
verifier('la règle ne touche ni au DOM ni à la base', !/document\.|supabaseClient|fetch\(/.test(nu));
verifier('elle ne décide ni de « encaissé » ni du montant : elle les demande (R.articleEncaisse, R.montantArticleColis)', /R\.articleEncaisse\(c\)/.test(nu) && /R\.montantArticleColis\(c\)/.test(nu) && !/montant_article/.test(nu));
const ecran = lire('app/equipe/15-la-chaine-de-l-argent.js'), html = lire('app/equipe.html'), rapports = lire('app/equipe/07-rapports.js');
verifier('l\'écran lit TOUTE la base (cltLireTout), pas la liste de l\'écran', /cltLireTout/.test(ecran) && !/allColis/.test(ecran.replace(/\/\*[\s\S]*?\*\//g, '')));
verifier('il demande chaque colonne que la règle et l\'addition lisent', ['statut', 'montant', 'montant_article', 'montant_livraison', 'article_non_encaisse', 'encaissement_remis', 'encaissement_remis_at', 'reverse_au_fournisseur_at', 'livre_at', 'commune_destination'].every((k) => new RegExp('\\b' + k + '\\b').test(ecran.match(/const COLONNES = ([\s\S]*?);/)[1])));
verifier('il n\'écrit rien', !/\.(update|insert|delete|upsert)\(/.test(ecran));
verifier('une lecture ratée se DIT (une boîte vide se lirait « pas d\'argent dehors »)', /a pas pu être lue/.test(ecran) && /cha-erreur/.test(ecran));
verifier('il se redessine avec les finances, donc après chaque remise et chaque reversement', /CLTChaineEcran\.init\(\); CLTChaineEcran\.rafraichir\(\);/.test(rapports));
verifier('la boîte est en tête de Finances, sous le point du jour ; la règle est chargée avant l\'écran', html.indexOf('id="chaine-argent"') > html.indexOf('id="point-du-jour"') && html.indexOf('chaine-de-l-argent.js?v=') < html.indexOf('equipe/15-la-chaine-de-l-argent.js?v=') && html.indexOf('chaine-de-l-argent.js?v=') > 0);
const css = lire('app/style.css');
verifier('s\'ouvre sur aujourd\'hui ; ‹ › carrés de 44 px ; mode nuit ; téléphone', /let jour = '';/.test(ecran) && /\.cha-nav-btn\{ width:44px; flex:0 0 44px;/.test(css) && /html\[data-theme="dark"\] \.chaine-argent/.test(css) && /@media \(max-width:760px\)\{\s*\.chaine-argent/.test(css));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
