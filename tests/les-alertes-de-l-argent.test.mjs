/* LES ALERTES DE L'ARGENT — 18 septembre 2026
   ==========================================================================================
   Celtis, le 18 : « Il y a encore des confusions au niveau de chaque colis, de l'enregistrement
   et tout. […] Lorsqu'un colis est créé sans qu'on marque le coût de l'article ou bien sans
   qu'on ne marque le coût de la livraison, il faudrait qu'une alerte se déclenche. […] Le bouton
   n'est pas clair pour la livraison payée en avance. Peut-être c'est de préciser, livraison
   payée sur la vendeuse ou bien sur le fournisseur, c'est mieux, sur le fournisseur. […] Il
   faudrait que toute ambiguïté soit levée, que ce soit au niveau de la création des colis, ou
   lors du suivi, ou au niveau du livreur. […] Qu'il y ait vraiment des alertes là où il faut,
   surtout concernant au niveau de l'argent. »

   DEUX CONFUSIONS, DEUX RÉPONSES, UN SEUL BANC.

   1. UN MONTANT QUI MANQUE NE SE VOYAIT PAS. Un colis pouvait partir avec ses deux montants
      vides. montantArticleColis() répond zéro pour un champ jamais rempli : « 0 FCFA » et « la
      cliente n'a pas encore donné son prix » s'écrivaient donc de la même façon, sur les trois
      écrans. L'écart se découvrait le soir, sur le relevé, au téléphone.
      La réponse tient en deux gestes : une ALERTE au moment d'enregistrer (elle avertit, elle ne
      refuse pas — la cliente n'a pas toujours fixé son prix), et une MARQUE qui reste tant que le
      montant manque. Un avertissement qui ne survit pas à sa fenêtre ne protège qu'une seconde.

   2. « PAYÉE D'AVANCE » NE DISAIT PAS PAYÉE À QUI. Trois lectures possibles — au livreur, à CLT,
      chez le fournisseur — et une seule est la bonne : chez le fournisseur, donc CLT la lui
      retient. Les deux autres conduisent à réclamer la même somme deux fois, ou à ne jamais la
      réclamer. Les libellés disent désormais l'endroit, et « chez vous » sur l'écran de la
      cliente, parce que le fournisseur, c'est elle.

   Ce que ce banc NE couvre pas, parce que d'autres le font déjà : le « Soldé » à la place du
   tiret et l'origine des retenues sur le relevé (tests/releve-du-soir-par-cliente.test.mjs et
   tests/releve-en-couleur.test.mjs), et les deux enregistrements qui passent par l'alerte
   (tests/corriger-adresse-colis.test.mjs, qui les exécute pour de vrai).

   Lancer à la main :  node tests/les-alertes-de-l-argent.test.mjs */

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
const fournisseur = lire('fournisseur.html');
const equipe = fs.readdirSync(path.join(APP, 'equipe')).filter(f => f.endsWith('.js')).sort()
  .map(f => lire('equipe/' + f)).join('\n');
const style = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 400) : '')); }
}
function titre(t){ console.log('\n' + t); }
function blocDe(src, nom, fichier){
  const debut = src.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans ${fichier}`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable dans ${fichier}`); process.exit(1);
}
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');

/* ---------- Le vrai code, pas une copie ---------- */
const ctx = vm.createContext({ console });
vm.runInContext((sourceConfig.match(/^const\s+COMMUNE_EXPEDITION\s*=.*?;\s*$/m) || [''])[0], ctx);
vm.runInContext(['formatMontant', 'escapeHTML'].map(n => blocDe(common, n, 'clt-common.js')).join('\n\n'), ctx);
vm.runInContext([
  'estExpedition', 'colisADetailMontant',
  'montantNonRenseigne', 'colisAncienSansDetail',
  'montantArticleManquant', 'montantLivraisonManquant', 'montantsManquantsColis',
  'colisSansMontant', 'alerteMontantsManquantsTexte', 'colisDepuisSaisie',
  'chezLeFournisseur',
].map(n => blocDe(sourceConfig, n, 'config.js et lib/')).join('\n\n'), ctx);
const {
  montantsManquantsColis, colisSansMontant, alerteMontantsManquantsTexte,
  colisDepuisSaisie, chezLeFournisseur, montantArticleManquant, montantLivraisonManquant,
} = ctx;
const COMMUNE_EXPEDITION = vm.runInContext('COMMUNE_EXPEDITION', ctx);

/* ==========================================================================================
   1. CE QUI COMPTE COMME UN MONTANT MANQUANT
   ========================================================================================== */
titre('Un champ vide est un manque ; un zéro écrit exprès n\'en est pas un');

verifier('les deux montants remplis : rien à signaler',
  montantsManquantsColis({ montant_article: 15000, montant_livraison: 1500 }).length === 0);

verifier('un article vide est nommé',
  /montant de l’article|montant de l'article/.test(montantsManquantsColis({ montant_article: null, montant_livraison: 1500 })[0] || ''),
  JSON.stringify(montantsManquantsColis({ montant_article: null, montant_livraison: 1500 })));

verifier('une livraison vide est nommée',
  montantsManquantsColis({ montant_article: 15000, montant_livraison: null })[0] === 'les frais de livraison',
  JSON.stringify(montantsManquantsColis({ montant_article: 15000, montant_livraison: null })));

verifier('les deux vides sont nommés tous les deux',
  montantsManquantsColis({ montant_article: null, montant_livraison: null }).length === 2);

/* « UNE LIVRAISON OFFERTE S'ÉCRIT 0 » — la règle protégée par le banc de la saisie en lot depuis
   le 21 août. Un zéro est une décision, pas un oubli. Confondre les deux ferait sonner l'alerte
   sur chaque geste commercial, et l'on apprendrait en une semaine à cliquer « Enregistrer quand
   même » sans lire — ce qui rendrait l'alerte inutile le jour où elle aurait raison. */
verifier('une livraison offerte, écrite « 0 », ne déclenche rien',
  montantsManquantsColis({ montant_article: 15000, montant_livraison: 0 }).length === 0);
verifier('un article à 0 écrit exprès non plus',
  montantsManquantsColis({ montant_article: 0, montant_livraison: 1500 }).length === 0);
verifier('la chaîne vide compte comme un champ jamais rempli — c\'est ce que rend un <input> vide',
  montantsManquantsColis({ montant_article: '', montant_livraison: 1500 }).length === 1);

verifier('« Article soldé » répond pour l\'article : il a été payé chez le fournisseur',
  montantsManquantsColis({ montant_article: null, montant_livraison: 1500, article_non_encaisse: true }).length === 0);
verifier('mais « Article soldé » ne répond pas pour la livraison',
  montantsManquantsColis({ montant_article: null, montant_livraison: null, article_non_encaisse: true }).length === 1);

/* Un colis d'avant le découpage article / livraison ne porte qu'un « montant » global. Sonner sur
   toute la liste ancienne, c'est apprendre à l'équipe à ignorer l'alerte. */
verifier('un ancien colis à montant global n\'a rien à compléter',
  montantsManquantsColis({ montant: 15000 }).length === 0);
verifier('un colis entièrement vide, lui, manque bien de ses deux montants',
  montantsManquantsColis({}).length === 2);
verifier('un colis absent ne fait rien tomber',
  montantsManquantsColis(null).length === 0 && colisSansMontant(null) === false);

verifier('sur une expédition, le champ porte son nom d\'écran : les frais de course',
  montantsManquantsColis({ commune_destination: COMMUNE_EXPEDITION, montant_article: 5000, montant_livraison: null })[0] === 'les frais de course',
  JSON.stringify(montantsManquantsColis({ commune_destination: COMMUNE_EXPEDITION, montant_article: 5000, montant_livraison: null })));

verifier('la phrase de l\'alerte nomme ce qui manque, et rien d\'autre',
  alerteMontantsManquantsTexte({ montant_article: null, montant_livraison: null })
    === "Il manque le montant de l'article et les frais de livraison.",
  alerteMontantsManquantsTexte({ montant_article: null, montant_livraison: null }));
verifier('et elle est vide quand tout est dit',
  alerteMontantsManquantsTexte({ montant_article: 1, montant_livraison: 1 }) === '');

/* Les deux écrans de saisie en lot lisent leurs champs sous les mêmes noms : la règle se pose sur
   la ligne qu'on tape comme sur le colis enregistré, au lieu d'être réécrite une fois par écran. */
titre('La ligne qu\'on est en train de taper passe par la même règle');
verifier('une saisie vide donne un colis à qui il manque les deux montants',
  montantsManquantsColis(colisDepuisSaisie({ montantArticle: '', montantLivraison: '' })).length === 2);
verifier('une saisie complète ne déclenche rien',
  montantsManquantsColis(colisDepuisSaisie({ montantArticle: '15000', montantLivraison: '1500' })).length === 0);
verifier('« Article soldé » coché à la saisie répond déjà pour l\'article',
  montantsManquantsColis(colisDepuisSaisie({ montantArticle: '', montantLivraison: '1500', articleSolde: true })).length === 0);
verifier('la commune de la saisie suit, pour que l\'expédition soit nommée juste',
  montantsManquantsColis(colisDepuisSaisie({ communeDestination: COMMUNE_EXPEDITION, montantArticle: '5000', montantLivraison: '' }))[0] === 'les frais de course');

/* ==========================================================================================
   2. L'ALERTE EST POSÉE PARTOUT OÙ UN COLIS S'ÉCRIT
   ========================================================================================== */
titre('Les quatre chemins d\'écriture posent l\'alerte, et aucun ne la remplace par un refus');
{
  const lot = sansCommentaires(blocDe(equipe, 'lotAvertirMontantsManquants', 'equipe/01-saisie-en-lot.js'));
  verifier('saisie en lot du bureau : la fonction existe et lit la règle commune',
    /montantsManquantsColis\(colisDepuisSaisie\(/.test(lot), lot.slice(0, 200));
  verifier('elle avertit par cltConfirm et rend la réponse — donc elle n\'impose rien',
    /return await cltConfirm\(/.test(lot));
  const enLot = sansCommentaires(equipe);
  verifier('les deux boutons du bureau (un colis, tout le lot) l\'appellent',
    (enLot.match(/lotAvertirMontantsManquants\(/g) || []).length === 3,
    'trouvé : ' + (enLot.match(/lotAvertirMontantsManquants\(/g) || []).length + ' (déclaration comprise)');

  const fr = sansCommentaires(fournisseur);
  verifier('espace cliente : la saisie en lot l\'appelle pour un colis et pour tout le lot',
    (fr.match(/lotfrAvertirMontantsManquants\(/g) || []).length === 3,
    'trouvé : ' + (fr.match(/lotfrAvertirMontantsManquants\(/g) || []).length);
  // Le nom de la fonction du lot CONTIENT celui-ci : sans la garde, on compterait les deux.
  verifier('espace cliente : la copie d\'un colis et la correction l\'appellent aussi',
    (fr.match(/(?<![A-Za-z])frAvertirMontantsManquants\(/g) || []).length === 3,
    'trouvé : ' + (fr.match(/(?<![A-Za-z])frAvertirMontantsManquants\(/g) || []).length);

  verifier('bureau : la correction d\'un colis regarde le colis TEL QU\'IL SERA, pas l\'écran seul',
    /Object\.assign\(\{\}, avant, updatePayload\)/.test(enLot)
    && /montantsManquantsColis\(apres\)/.test(enLot));
}

titre('Une alerte qui ne survit pas à sa fenêtre ne protège qu\'une seconde');
{
  const badge = sansCommentaires(blocDe(equipe, 'eqMontantManquantHTML', 'equipe/03-file-hors-reseau.js'));
  verifier('la carte du bureau porte une marque permanente, tirée de la même règle',
    /montantsManquantsColis\(c\)/.test(badge) && /Montant manquant/.test(badge), badge.slice(0, 200));
  /* Mesuré en base avant d'écrire la règle : 274 colis sur 1 523 n'ont pas leurs deux montants,
     mais 166 sont déjà reversés — montants figés, cliente payée, rien à compléter. Une marque
     rouge sur laquelle personne ne peut agir s'apprend à ne plus se voir. */
  verifier('un compte déjà reversé ne porte pas la marque : il n\'y a plus rien à compléter',
    /if \(c && c\.reverse_au_fournisseur_at\) return '';/.test(badge), badge.slice(0, 300));
  verifier('elle est posée sur les DEUX cartes du bureau (la liste, et la fiche dépliée)',
    (sansCommentaires(equipe).match(/\$\{eqMontantManquantHTML\(c\)\}/g) || []).length === 2,
    'trouvé : ' + (sansCommentaires(equipe).match(/\$\{eqMontantManquantHTML\(c\)\}/g) || []).length);
  verifier('elle se lit en rouge, comme une erreur d\'argent, et non dans l\'orange des attentes',
    /\.montant-manquant-badge\{[^}]*color:#9a2b1c/.test(style.replace(/\s+/g, ' ').replace(/ \{/g, '{')),
    (style.match(/\.montant-manquant-badge\{[\s\S]*?\}/) || [''])[0]);

  const ligne = sansCommentaires(blocDe(livreur, 'montantsLigneHTML', 'livreur.html'));
  verifier('le téléphone du livreur n\'écrit plus « 0 FCFA » pour un champ vide',
    /montantArticleManquant\(c\)/.test(ligne) && /montantLivraisonManquant\(c\)/.test(ligne)
    && /non renseigné/.test(ligne), ligne);
  verifier('et il le dit en rouge, pour que ça ne se confonde pas avec un vrai zéro',
    /\.colis-montants \.montant-absent\{ color:#b3261e/.test(livreur));

  /* Le total « Le destinataire remet » additionnait le zéro d'un champ vide comme un vrai
     montant : il annonçait une somme fausse avec l'aplomb d'une somme juste. */
  const ligneEq = sansCommentaires(blocDe(equipe, 'eqLigneMontantsHTML', 'equipe/03-file-hors-reseau.js'));
  verifier('la carte du bureau n\'écrit plus « 0 FCFA » pour un champ vide',
    /montantArticleManquant\(c\)/.test(ligneEq) && /montantLivraisonManquant\(c\)/.test(ligneEq)
    && /non renseigné/.test(ligneEq), ligneEq);
  verifier('et elle n\'annonce plus un total que personne ne connaît',
    /colisSansMontant\(c\)/.test(ligneEq) && /à compléter/.test(ligneEq), ligneEq);
  verifier('cette ligne est écrite une seule fois pour les deux cartes du bureau',
    (sansCommentaires(equipe).match(/\$\{eqLigneMontantsHTML\(c\)\}/g) || []).length === 2
    && (sansCommentaires(equipe).match(/Le destinataire remet/g) || []).length === 1);

  verifier('la carte de la cliente le dit aussi, sur ses deux lignes d\'argent',
    /montantArticleManquant\(c\) \? '<span class="montant-absent">non renseigné<\/span>'/.test(fournisseur)
    && /montantLivraisonManquant\(c\) \? '<span class="montant-absent">non renseignés<\/span>'/.test(fournisseur));
}

/* ==========================================================================================
   3. PAYÉE OÙ ? LES LIBELLÉS DISENT L'ENDROIT
   ========================================================================================== */
titre('« Payée d\'avance » ne disait pas payée à qui : les libellés disent l\'endroit');

verifier('par défaut, c\'est « chez le fournisseur »', chezLeFournisseur() === 'chez le fournisseur');
verifier('sur l\'écran de la cliente, c\'est « chez vous » — le fournisseur, c\'est elle',
  chezLeFournisseur('cliente') === 'chez vous');

/* On lit les écrans eux-mêmes : une case à cocher dont le libellé ne dit pas l'endroit est
   exactement le défaut qu'on répare, et elle reviendrait sans bruit par une page oubliée. */
for (const [nom, src] of [['le bureau', equipe], ['l\'espace cliente', fournisseur], ['le téléphone du livreur', livreur]]) {
  const visible = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
  verifier(`${nom} n'écrit plus « payée d'avance » nulle part`,
    !/payée d'avance/i.test(visible),
    (visible.match(/.{0,80}payée d'avance.{0,60}/i) || [''])[0]);
}

verifier('le bureau coche « Livraison déjà payée chez le fournisseur »',
  /Livraison déjà payée chez le fournisseur<\/label>/.test(equipe));
verifier('la cliente coche « Livraison déjà payée chez vous », sur ses trois formulaires',
  (fournisseur.match(/Livraison déjà payée chez vous<\/label>/g) || []).length === 3,
  'trouvé : ' + (fournisseur.match(/Livraison déjà payée chez vous<\/label>/g) || []).length);
verifier('le livreur aussi voit l\'endroit sur son bouton',
  /Payée chez le fournisseur/.test(livreur) && /Livraison déjà payée chez le fournisseur \?/.test(livreur));

verifier('« Article soldé » dit l\'endroit lui aussi, des deux côtés',
  /Article déjà soldé chez le fournisseur/.test(equipe)
  && /Article déjà soldé chez vous/.test(fournisseur)
  && /Article déjà soldé chez le fournisseur \?/.test(livreur));

/* La cliente lit le badge d'état sur sa propre carte : il doit lui parler d'elle. */
verifier('la carte de la cliente demande la version « chez vous » du badge',
  (fournisseur.match(/paiementBadgeHTML\(c, 'cliente'\)/g) || []).length === 2,
  'trouvé : ' + (fournisseur.match(/paiementBadgeHTML\(c, 'cliente'\)/g) || []).length);
verifier('ses deux exports aussi',
  (fournisseur.match(/paiementInfo\(c, 'cliente'\)/g) || []).length === 2);
verifier('le bureau, lui, ne demande rien : il lit la version « chez le fournisseur »',
  !/paiementBadgeHTML\(c, 'cliente'\)/.test(equipe));

/* ============================================================================================ */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
