/* « L'ESSENTIEL » COMPTE COMME LA CAISSE — 22 septembre 2026
   ==========================================================================================
   CE QUI A ÉTÉ MESURÉ CE JOUR-LÀ, EN PRODUCTION, AVANT DE TOUCHER À QUOI QUE CE SOIT :

     « L'essentiel » (écran de l'équipe) annonçait   1 517 000 FCFA d'argent non remis
     La règle de la maison en comptait                1 449 400 FCFA
     Écart, tous les soirs                               67 600 FCFA

   La pastille additionnait montantTotalColis() — article + livraison, sans condition — alors
   que la caisse livreur passe par montantEnMainDuLivreur(). Le commentaire du code disait
   pourtant « mêmes règles que la caisse livreur ». Il était faux depuis l'origine.

   C'est la forme exacte de l'incident du 25 août 2026 : 11 000 sur le téléphone du livreur,
   14 000 dans le tableau du bureau, et personne n'avait tort. Ce banc existe pour que ce
   trou-là ne se rouvre jamais : il fait tourner LE VRAI code de l'écran, sur des colis choisis
   pour que les deux calculs DIFFÈRENT, et il refuse la publication s'ils ne se rejoignent pas.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { chargerApp } from './_charger-app.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

const app = chargerApp();

/* Le décor : six colis choisis pour que l'ancien calcul et le bon DIVERGENT. Un décor où ils
   tombent d'accord ne prouverait rien. */
const c = (numero, o) => Object.assign({
  id: numero, numero, statut: 'livre', livreur_id: 'L1', commune_destination: 'Cocody',
  montant_article: 10000, montant_livraison: 1500,
  article_non_encaisse: false, livraison_payee: false, livraison_non_encaissee: false, livraison_payee_non_livre: false,
  frais_expedition: 0, frais_expedition_rembourse_at: null,
  frais_additionnels_montant: 0, frais_additionnels_rembourse_at: null, frais_additionnels_regle_at: null,
  encaissement_remis: false, reverse_au_fournisseur_at: null, frais_soldes_at: null,
}, o || {});

const LOT = [
  c('E-1'),                                                                                  // 11 500 des deux côtés
  c('E-2', { commune_destination: 'Expédition (intérieur)', montant_article: 20000, montant_livraison: 2000 }), // 22 000 vs 0
  c('E-3', { montant_article: 30000, montant_livraison: 3000, frais_expedition: 4000, frais_additionnels_montant: 500 }), // 33 000 vs 28 500
  c('E-4', { montant_article: 5000, montant_livraison: 1000, encaissement_remis: true }),     // soldé : hors compte
  c('E-5', { statut: 'non_livre', montant_article: 7000, montant_livraison: 1200, livraison_payee_non_livre: true }), // oublié : 0 vs 1 200
  c('E-6', { montant_article: 9000, montant_livraison: 900, article_non_encaisse: true }),    // 9 900 vs 900
];

/* LE REPLI DE L'ÉCRAN, EXÉCUTÉ. On ne lit pas le texte du fichier : on en extrait le bloc et on
   le fait tourner avec les vraies fonctions d'argent. Un contrôle qui cherche un NOM DE
   FONCTION dans du texte surveille la façon d'écrire, pas ce que le code fait. */
function replliDeLEcran(colis) {
  const src = lire('app/equipe/03-file-hors-reseau.js');
  const debut = src.indexOf('let resteARemettre = 0, nbASolder = 0;');
  const fin = src.indexOf('});', debut) + 3;
  if (debut < 0 || fin < 3) throw new Error('bloc « argent non remis » introuvable dans 03-file-hors-reseau.js');
  const bloc = src.slice(debut, fin);
  const bac = vm.createContext({
    colis, base: null, Number, Math, Object, Array, String, console,
    montantEnMainDuLivreur: app.montantEnMainDuLivreur,
    coursePayeeSansLivraison: app.coursePayeeSansLivraison,
    montantTotalColis: app.montantTotalColis,
  });
  vm.runInContext(bloc + '\n; ({ resteARemettre, nbASolder })', bac);
  return vm.runInContext('({ resteARemettre: resteARemettre, nbASolder: nbASolder })', bac);
}

console.log('\n1. Le décor fait bien diverger les deux calculs (sinon ce banc ne prouverait rien)');
{
  const ancien = LOT.filter((x) => x.statut === 'livre' && !x.encaissement_remis)
    .reduce((t, x) => t + app.montantTotalColis(x), 0);
  verifier('l\'ancien calcul donnait 76 400', ancien === 76400, ancien);
  verifier('les six colis couvrent les cinq écarts possibles',
    LOT.some((x) => x.commune_destination === 'Expédition (intérieur)')
    && LOT.some((x) => x.article_non_encaisse)
    && LOT.some((x) => x.frais_expedition > 0 && x.frais_additionnels_montant > 0)
    && LOT.some((x) => x.livraison_payee_non_livre && x.statut !== 'livre')
    && LOT.some((x) => x.encaissement_remis));
}

console.log('\n2. L\'écran compte maintenant comme la caisse');
{
  const r = replliDeLEcran(LOT);
  verifier('reste à remettre : 42 100, et non 76 400', r.resteARemettre === 42100, r);
  verifier('quatre colis à solder (un livré sans billets reste à solder)', r.nbASolder === 4, r);

  // La caisse livreur, la vraie, sur les mêmes colis.
  const ligne = app.caisseParLivreur(LOT).find((l) => l.id === 'L1');
  verifier('LE POINT QUI COMPTE : la pastille et la caisse livreur disent le MÊME chiffre',
    r.resteARemettre === ligne.reste, { pastille: r.resteARemettre, caisse: ligne.reste });
  verifier('et le téléphone du livreur aussi',
    app.caisseEnMainDuLivreur(LOT, 'L1').montant === r.resteARemettre,
    { telephone: app.caisseEnMainDuLivreur(LOT, 'L1').montant, pastille: r.resteARemettre });
}

console.log('\n3. Ce que le repli ne fait plus');
{
  const src = lire('app/equipe/03-file-hors-reseau.js');
  const bloc = src.slice(src.indexOf('let resteARemettre = 0, nbASolder = 0;'), src.indexOf('});', src.indexOf('let resteARemettre = 0, nbASolder = 0;')));
  verifier('il n\'additionne plus montantTotalColis()', !/montantTotalColis/.test(bloc), bloc.slice(0, 200));
  verifier('il passe par la règle de la maison', /montantEnMainDuLivreur/.test(bloc));
  verifier('il compte la course payée sans livraison', /coursePayeeSansLivraison/.test(bloc));
  verifier('le commentaire dit l\'écart mesuré, pas une promesse', /1 517 000|67 600/.test(src));
}

console.log('\n4. La migration : la base appelle la règle au lieu de la recopier');
{
  const f = path.join(RACINE, '_sql-prive/2026-09-22-l-essentiel-compte-comme-la-caisse.sql');
  if (!fs.existsSync(f)) console.log('   (_sql-prive absent de ce dépôt : contrôles sautés, ils tournent sur le Mac)');
  else {
    const m = lire('_sql-prive/2026-09-22-l-essentiel-compte-comme-la-caisse.sql');
    verifier('reste_a_remettre passe par montant_en_main_du_livreur', /public\.montant_en_main_du_livreur\(x\) as en_main/.test(m));
    verifier('et plus par une addition recopiée', !/'reste_a_remettre'[\s\S]{0,200}montant_article/.test(m));
    verifier('la course payée sans livraison entre dans le compte', /course_payee_sans_livraison/.test(m));
    verifier('le calcul est séparé du contrôle, pour qu\'une tâche planifiée puisse lire',
      /create or replace function public\.essentiel_compteurs_calcul/.test(m)
      && /return public\.essentiel_compteurs_calcul\(\)/.test(m));
    verifier('et la porte de l\'écran garde son contrôle', /raise exception 'reserve_a_l_equipe'/.test(m));
    verifier('la porte de service n\'est ouverte à personne', /revoke all on function public\.essentiel_compteurs_calcul\(\) from public, anon, authenticated/.test(m));
    verifier('la migration s\'enregistre au registre', /migration_appliquee\('2026-09-22-l-essentiel-compte-comme-la-caisse\.sql'/.test(m));
  }
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
