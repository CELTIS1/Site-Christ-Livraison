/* LA COURSE EST DUE MÊME SI LE COLIS REVIENT — 18 septembre 2026
   ==========================================================================================
   Celtis, le 18 : « Lorsqu'un colis n'est pas livré, il y a des possibilités où on paye la
   livraison. Comme par exemple, le livreur s'est déplacé, il est arrivé au lieu de rencontre
   pour livrer et que le client finalement décide de ne plus prendre le colis. Mais là, il paye
   la livraison. Donc, quand le livreur met non livré au retour, il faudrait lui proposer
   immédiatement : est-ce que la livraison a été payée, oui ou non. Si la livraison a été payée,
   le montant de la livraison est noté, et dans son point, ça doit être noté. »

   Ce banc tient la règle d'argent — la partie où une erreur coûte de l'argent réel :
     1. quand la course compte, et quand elle ne compte pas (quatre cas, pas un de plus) ;
     2. elle entre dans la caisse du livreur, sans grossir le nombre de colis livrés ;
     3. le point du jour la range dans l'encaissé et non dans le manquant — l'égalité
        « attendu = encaissé + non encaissé » doit tenir ;
     4. le téléphone pose la question et écrit la colonne ; le bureau peut la corriger ;
     5. la règle SQL dit la même chose que la règle JavaScript.

   Lancer à la main :  node tests/la-course-payee-sans-livraison.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const lire = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const sourceConfig = ['config.js']
  .concat(fs.readdirSync(path.join(APP, 'lib')).filter(f => f.endsWith('.js')).sort().map(f => 'lib/' + f))
  .map(lire).join('\n');
const common = lire('clt-common.js');
const livreur = lire('livreur.html');
const pointDuJour = lire('point-du-jour.js');
const equipe = fs.readdirSync(path.join(APP, 'equipe')).filter(f => f.endsWith('.js')).sort()
  .map(f => lire('equipe/' + f)).join('\n');

let reussies = 0, echouees = 0, ignorees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 400) : '')); }
}
function ignorer(t, pourquoi){ ignorees++; console.log('  ➖ ' + t + ' — ' + pourquoi); }
function titre(t){ console.log('\n' + t); }
function blocDe(src, nom, fichier){
  const debut = src.search(new RegExp('function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans ${fichier}`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  process.exit(1);
}

const ctx = vm.createContext({ console });
vm.runInContext((sourceConfig.match(/^const\s+COMMUNE_EXPEDITION\s*=.*?;\s*$/m) || [''])[0], ctx);
vm.runInContext(['formatMontant'].map(n => blocDe(common, n, 'clt-common.js')).join('\n\n'), ctx);
vm.runInContext([
  'estExpedition', 'colisADetailMontant', 'montantArticleColis', 'montantLivraisonColis',
  'montantTotalColis', 'fraisExpeditionColis', 'fraisSoldes', 'fraisCourseColis',
  'fraisCourseAcquis', 'fraisCourseADevoir', 'fraisAdditionnelsColis', 'fraisAdditionnelsADevoir',
  'montantArticleReverse', 'articleEncaisse', 'livraisonEncaissee', 'fraisAdditionnelsRegle',
  'coursePayeeSansLivraison', 'montantCoursePayeeSansLivraison',
  'montantArticleEncaisse', 'montantLivraisonEncaissee', 'fraisExpeditionARembourser',
  'fraisExpeditionADevoir', 'montantArticleADevoir',
  'montantEnMainDuLivreur', 'montantManquantALaLivraison', 'totauxArgent', 'caisseParLivreur',
].map(n => blocDe(sourceConfig, n, 'config.js')).join('\n\n'), ctx);
const { coursePayeeSansLivraison, montantCoursePayeeSansLivraison, livraisonEncaissee,
        montantEnMainDuLivreur, totauxArgent, caisseParLivreur } = ctx;
const EXPEDITION = vm.runInContext('COMMUNE_EXPEDITION', ctx);

// Un colis ordinaire d'Abidjan : 9 000 F d'article, 1 500 F de course.
const colis = (extra) => Object.assign({
  id: 'c1', livreur_id: 'L1', statut: 'non_livre', commune_destination: 'Cocody',
  montant_article: 9000, montant_livraison: 1500,
  article_non_encaisse: false, livraison_payee: false, livraison_non_encaissee: false,
  livraison_payee_non_livre: false, encaissement_remis: false, frais_expedition: null,
  frais_expedition_rembourse_at: null, reverse_au_fournisseur_at: null, frais_soldes_at: null,
}, extra || {});

titre('1. Quand la course compte, et quand elle ne compte pas');
{
  verifier('non livré, déplacement payé : elle compte',
    coursePayeeSansLivraison(colis({ livraison_payee_non_livre: true })) === true);
  verifier('non livré, déplacement non payé : rien',
    coursePayeeSansLivraison(colis({})) === false);
  // Le colis est livré : c'est la règle ordinaire qui compte la course. Garder les deux
  // compterait deux fois le même billet — c'est la faute que ce banc est là pour empêcher.
  verifier('livré : c\'est la règle ordinaire qui compte, pas celle-ci',
    coursePayeeSansLivraison(colis({ statut: 'livre', livraison_payee_non_livre: true })) === false
    && livraisonEncaissee(colis({ statut: 'livre', livraison_payee_non_livre: true })) === true
    && montantEnMainDuLivreur(colis({ statut: 'livre', livraison_payee_non_livre: true })) === 10500);
  verifier('une expédition : le destinataire a déjà payé chez la vendeuse, rien à encaisser',
    coursePayeeSansLivraison(colis({ commune_destination: EXPEDITION, livraison_payee_non_livre: true })) === false);
  verifier('déjà payée d\'avance au dépôt : on ne paie pas deux fois la même course',
    coursePayeeSansLivraison(colis({ livraison_payee: true, livraison_payee_non_livre: true })) === false);
  // Un colis retenté repasse « en livraison » : les billets sont toujours dans sa poche.
  verifier('retenté (« en livraison ») : l\'argent reçu reste dans sa poche',
    coursePayeeSansLivraison(colis({ statut: 'en_livraison', livraison_payee_non_livre: true })) === true);
  verifier('rendu au bureau (« retour ») : de même',
    coursePayeeSansLivraison(colis({ statut: 'retour', livraison_payee_non_livre: true })) === true);
  verifier('le montant est celui de la course du colis, ni plus ni moins',
    montantCoursePayeeSansLivraison(colis({ livraison_payee_non_livre: true })) === 1500
    && montantCoursePayeeSansLivraison(colis({})) === 0);
  verifier('l\'article, lui, n\'est jamais encaissé : le colis n\'a pas été remis',
    montantEnMainDuLivreur(colis({ livraison_payee_non_livre: true })) === 1500);
  verifier('rien du tout quand la question ne se pose pas',
    montantEnMainDuLivreur(colis({})) === 0);
  verifier('sans la colonne (colis d\'avant la migration), rien ne change',
    coursePayeeSansLivraison({ statut: 'non_livre', montant_livraison: 1500, commune_destination: 'Cocody' }) === false);
}

titre('2. Elle entre dans la caisse du livreur, sans grossir le nombre de livrés');
{
  const lot = [
    colis({ id: 'a', statut: 'livre' }),                                   // 9 000 + 1 500
    colis({ id: 'b', livraison_payee_non_livre: true }),                   //       + 1 500
    colis({ id: 'c' }),                                                    //         rien
  ];
  const l = caisseParLivreur(lot)[0];
  verifier('le livreur tient 12 000 F : deux poches d\'un livré, la course d\'un non livré',
    l.total === 12000, JSON.stringify(l));
  verifier('« Livrés » reste à 1 — un colis non livré n\'y a pas sa place',
    l.nb === 1, JSON.stringify(l));
  verifier('la course sans livraison est comptée à part, pour pouvoir l\'expliquer',
    l.nbCoursesSansLivraison === 1, JSON.stringify(l));
  verifier('les 12 000 sont à remettre ce soir, aucun n\'est déjà remis',
    l.reste === 12000 && l.remis === 0, JSON.stringify(l));
  verifier('les deux colis à remettre sont nommés, le troisième non',
    l.idsAremettre.length === 2 && l.idsAremettre.indexOf('a') !== -1 && l.idsAremettre.indexOf('b') !== -1,
    JSON.stringify(l.idsAremettre));
  const t = totauxArgent(lot);
  verifier('les totaux rangent la course dans l\'encaissé (1 500 + 1 500)',
    t.livraisonEncaissee === 3000, JSON.stringify({ liv: t.livraisonEncaissee, art: t.articleEncaisse }));
  verifier('et la nomment à part, pour l\'expliquer sans la compter deux fois',
    t.coursesSansLivraison === 1500 && t.nbCoursesSansLivraison === 1);
  verifier('la recette de CLT la comprend',
    t.recetteLivraison === 3000, String(t.recetteLivraison));
  verifier('rien n\'est « manquant » : l\'argent est rentré',
    t.manquantALaLivraison === 0);
  // L'avance de gare ne doit être déduite qu'une fois : le colis passe désormais par la
  // première boucle, qui la déduit déjà, et ne doit plus repasser par celle des avances.
  const avecGare = caisseParLivreur([colis({ id: 'g', commune_destination: 'Cocody',
    livraison_payee_non_livre: true, frais_expedition: 2000 })])[0];
  verifier('une avance de gare n\'est déduite qu\'une seule fois (1 500 − 2 000 = −500)',
    avecGare.total === -500, JSON.stringify(avecGare));
}

titre('3. Le point du jour la range dans l\'encaissé, pas dans le manquant');
{
  const calculer = (() => {
    const src = blocDe(pointDuJour, 'calculer', 'point-du-jour.js');
    const sandbox = vm.createContext(Object.assign({ console }, ctx));
    vm.runInContext('const somme = (liste, fn) => liste.reduce((s, c) => s + (Number(fn(c)) || 0), 0);', sandbox);
    vm.runInContext(['resteDu', 'decalerJour', 'todayISO'].map(n => blocDe(pointDuJour, n, 'point-du-jour.js'))
      .concat([blocDe(common, 'todayLocalISODate', 'clt-common.js'), src]).join('\n\n'), sandbox);
    return sandbox.calculer;
  })();
  const jour = [
    colis({ id: 'a', statut: 'livre' }),
    colis({ id: 'b', livraison_payee_non_livre: true }),
    colis({ id: 'c' }),
  ];
  const r = calculer(jour, [], [], [], []);
  verifier('l\'encaissé comprend la course du colis non livré (1 500 + 1 500)',
    r.livraison.encaisse === 3000, JSON.stringify(r.livraison));
  verifier('le non encaissé ne retient que le colis vraiment perdu (1 500)',
    r.livraison.nonEncaisse === 1500, JSON.stringify(r.livraison));
  verifier('l\'égalité tient : attendu = encaissé + non encaissé',
    r.livraison.attendu === r.livraison.encaisse + r.livraison.nonEncaisse && r.ok1 === true,
    JSON.stringify(r.livraison));
  verifier('la recette du jour la comprend',
    r.livraison.recette === 3000, String(r.livraison.recette));
  verifier('le point la nomme et la compte, pour qu\'on sache d\'où elle vient',
    r.livraison.sansLivraison === 1500 && r.livraison.nbSansLivraison === 1);
  verifier('« Livrés » reste à 1, « Non livrés » à 2',
    r.nb.livres === 1 && r.nb.nonLivres === 2, JSON.stringify(r.nb));
  verifier('la caisse du jour la comprend aussi (9 000 + 1 500 + 1 500)',
    r.caisse.enMain === 12000, JSON.stringify(r.caisse));
  verifier('et l\'écran l\'écrit sous la tuile « Encaissé à la porte »',
    /sansLivraison \? `dont \$\{F\(l\.sansLivraison\)\}/.test(pointDuJour)
    && /colis non livré/.test(pointDuJour));
}

titre('4. Le téléphone pose la question, le bureau peut corriger');
{
  verifier('la fenêtre du motif porte la question',
    /motif-echec__course/.test(livreur) && /la livraison a-t-elle été payée/i.test(livreur));
  verifier('deux réponses, oui et non, et rien d\'autre',
    (livreur.match(/data-payee="1"/g) || []).length === 1 && (livreur.match(/data-payee="0"/g) || []).length === 1);
  verifier('la question ne se pose pas quand il n\'y a rien à encaisser',
    /function courseAEncaisserSiEchec/.test(livreur)
    && /estExpedition\(colis\)\) return 0/.test(livreur)
    && /colis\.livraison_payee\) return 0/.test(livreur));
  verifier('choisir un motif sans répondre ne ferme pas la fenêtre',
    /if \(poserLaCourse && payee === null\)/.test(livreur) && /motif-echec__rappel/.test(livreur));
  verifier('la réponse part avec le statut « non livré »',
    /extra\.livraison_payee_non_livre = !!reponse\.payee/.test(livreur));
  verifier('un lot de colis non livrés porte la même réponse',
    /livraison_payee_non_livre: !!motifLot\.payee/.test(livreur));
  verifier('annuler le changement de statut ne perd pas la réponse',
    /livraison_payee_non_livre: !!avant\.livraison_payee_non_livre/.test(livreur));
  verifier('la carte du colis la relit, avec son montant',
    /motif-echec-ligne__course/.test(livreur) && /Déplacement payé/.test(livreur));
  verifier('le bureau a la case pour corriger',
    /edit-course-payee/.test(equipe) && /Déplacement payé \(non livré\)/.test(equipe));
  verifier('et elle ne s\'affiche que là où la question se pose',
    /c\.statut !== 'livre' && !estExpedition\(c\) && !c\.livraison_payee && montantLivraisonColis\(c\) > 0/.test(equipe));
  verifier('l\'enregistrement du bureau envoie bien la colonne',
    /updatePayload\.livraison_payee_non_livre = livraison_payee_non_livre/.test(equipe));
  verifier('le badge d\'argent le dit au lieu de « pas encore encaissé »',
    /coursePayeeSansLivraison\(c\)\) return \{ label: "Déplacement payé/.test(sourceConfig));
}

titre('5. La règle SQL dit la même chose que la règle JavaScript');
{
  const DOSSIER = path.join(RACINE, '_sql-prive');
  const fichier = path.join(DOSSIER, '2026-09-18-la-course-est-due-meme-si-le-colis-revient.sql');
  if (!fs.existsSync(fichier)) {
    ignorer('la migration est lisible', '_sql-prive n\'est pas dans le dépôt public : ce contrôle ne vaut qu\'en local');
  } else {
    const sql = fs.readFileSync(fichier, 'utf8');
    verifier('la colonne est créée sans casser une base déjà en service',
      /add column if not exists livraison_payee_non_livre boolean not null default false/.test(sql));
    verifier('elle est commentée : on saura dans six mois ce qu\'elle veut dire',
      /comment on column public\.colis\.livraison_payee_non_livre/.test(sql));
    verifier('le jumeau SQL applique les trois mêmes conditions que le JavaScript',
      /c\.statut <> 'livre'[\s\S]{0,400}?livraison_payee_non_livre[\s\S]{0,200}?not coalesce\(c\.livraison_payee, false\)[\s\S]{0,300}?<> 'Expédition \(intérieur\)'/.test(sql),
      'statut, livraison_payee et expédition doivent toutes les trois figurer dans la nouvelle branche');
    verifier('il n\'ajoute que la course, jamais l\'article',
      !/livraison_payee_non_livre[\s\S]{0,400}?montant_article, 0\)\s*\n?\s*else 0 end\s*\n\s*\+/.test(sql));
    verifier('la migration s\'inscrit au registre',
      /select public\.migration_appliquee\('2026-09-18-la-course-est-due-meme-si-le-colis-revient\.sql'/.test(sql));
  }
}

console.log(`\n${reussies} réussie${reussies > 1 ? 's' : ''}, ${echouees} échouée${echouees > 1 ? 's' : ''}`
  + (ignorees ? `, ${ignorees} ignorée${ignorees > 1 ? 's' : ''}.` : '.'));
process.exit(echouees ? 1 : 0);
