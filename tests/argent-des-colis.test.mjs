/* Banc d'essai de L'ARGENT — 25 août 2026
   ==========================================================================================

   POURQUOI CE BANC D'ESSAI EXISTE
   -------------------------------
   Un chiffre d'argent faux ne se comporte pas comme les autres défauts. Un bouton mal placé,
   on le voit et on le signale. Un total faux, on le RECOPIE : il part dans un carnet, dans un
   message WhatsApp, dans une remise du soir — et il devient, quelques jours plus tard, la
   version des faits contre laquelle plus personne ne peut argumenter.

   C'est ce qui s'est produit ici. Le 25/08/2026, la base contenait 48 colis livrés et
   183 500 FCFA d'articles remis à des destinataires, pendant que l'écran de CHAQUE cliente
   affichait « Encaissé pour vous : 0 FCFA » et « Aucun colis en attente de reversement ✔️ ».
   Le calcul était pourtant juste : il suivait fidèlement une case (article_paye) que personne
   ne cochait jamais — parce qu'aucun écran ne la proposait au moment où l'information existe.

   Ce banc d'essai garde CINQ RÈGLES. Chacune correspond à une façon dont l'argent a réellement
   été dit de travers, pas à une inquiétude théorique.

     1. ON N'ADDITIONNE JAMAIS L'ARTICLE ET LA LIVRAISON.
        L'article appartient à la cliente ; la livraison est le revenu de CLT. Leur somme n'est
        l'argent de personne. Elle s'appelait « Montant total » et servait à décider.

     2. LIVRÉ = ENCAISSÉ, SAUF EXCEPTION EXPLICITE.
        Le cas normal ne demande aucun clic. Un oubli ne peut donc plus effacer l'argent d'une
        cliente — au pire il ajoute de l'argent qu'on doit, une erreur qui se voit.

     3. « ENCAISSÉ » ET « REVERSÉ » SONT DEUX CHOSES.
        Encaissé = l'argent est rentré chez CLT. Reversé = la cliente l'a reçu. Les confondre,
        c'est dire à quelqu'un qu'il a été payé alors qu'il attend encore.

     4. ENREGISTRÉ ET ENCAISSÉ NE SE MÉLANGENT PAS.
        Un colis pas encore livré est enregistré, pas encaissé. Le compter comme encaissé,
        c'est annoncer au livreur de l'argent qu'il n'a pas dans la poche.

     5. L'INVARIANT TIENT TOUJOURS : encaissé = reversé + reste à devoir.
        Sur un colis, sur un jour, sur une cliente, sur toute la base. C'est cette égalité
        qu'on récite au téléphone à quelqu'un qui conteste.

   Comment : on extrait le VRAI code depuis app/config.js (pas une copie, qui finirait par
   diverger en silence) et on l'exécute avec des colis choisis. Une seconde partie relit les
   trois écrans pour vérifier qu'aucun d'eux n'a gardé une ancienne façon de compter.

   Lancer à la main :  node tests/argent-des-colis.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { controlerEtiquettesDeVersion } from './etiquettes-de-version.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const fournisseur = fs.readFileSync(path.join(APP, 'fournisseur.html'), 'utf8');
const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');

let reussies = 0, echouees = 0, ignorees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }
function ignorer(quoi, pourquoi){
  ignorees++;
  console.log(`  ⏭️  ${quoi} — non vérifié ici.\n       → ${pourquoi}`);
}

/* ---------- Extraction du vrai code ---------- */
function blocDe(src, nom){
  const debut = src.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans config.js`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable`); process.exit(1);
}

const contexte = vm.createContext({ console });
vm.runInContext([
  'colisADetailMontant',
  'montantArticleColis',
  'montantLivraisonColis',
  'montantTotalColis',
  'articleEncaisse',
  'livraisonEncaissee',
  'montantArticleEncaisse',
  'montantLivraisonEncaissee',
  'montantArticleADevoir',
  'montantEnMainDuLivreur',
  'montantManquantALaLivraison',
  'totauxArgent',
  'piedTotalHTML',
  'paiementInfo',
].map(n => blocDe(sourceConfig, n)).join('\n\n'), contexte);

const {
  montantArticleColis, montantLivraisonColis, montantTotalColis,
  articleEncaisse, livraisonEncaissee,
  montantArticleEncaisse, montantLivraisonEncaissee, montantArticleADevoir,
  montantEnMainDuLivreur, montantManquantALaLivraison,
  totauxArgent, piedTotalHTML, paiementInfo,
} = contexte;

/* Les contrôles de la section 8 cherchent des LIBELLÉS AFFICHÉS. Les commentaires du code
   parlent forcément de ces mêmes libellés — c'est même à cela qu'ils servent, expliquer ce
   qu'on a retiré et pourquoi. Les compter comme des occurrences reviendrait à interdire
   d'écrire l'histoire d'une correction dans le fichier où elle a eu lieu. On retire donc les
   commentaires avant de chercher. */
// On retire les commentaires HTML et les lignes « // … », et RIEN D'AUTRE. Retirer aussi les
// blocs « /* … */ » paraît naturel et s'est révélé dangereux : une expression régulière ou une
// chaîne de caractères contenant « */ » suffit à faire avaler la moitié du fichier au motif.
// Essayé le 25/08/2026 sur livreur.html : 126 686 caractères réduits à 62 839, et deux contrôles
// passés au vert alors qu'ils ne lisaient plus rien. Un contrôle aveugle est pire qu'aucun
// contrôle — il rassure. On s'en tient donc aux deux formes qu'on sait découper sans risque.
function sansCommentaires(src){
  return src
    .replace(/<!--[\s\S]*?-->/g, '')     // commentaires HTML
    .replace(/^\s*\/\/.*$/gm, '');       // lignes // …
}
function sansCommentairesSQL(src){
  return src.replace(/^\s*--.*$/gm, '');
}

/* Raccourci : un colis tel que la base le renvoie. */
function colis(extra){
  return Object.assign({ statut: 'en_attente', montant_article: 0, montant_livraison: 0 }, extra || {});
}

/* ==========================================================================================
   1. LES DEUX POCHES NE SE MÉLANGENT PAS
   ========================================================================================== */
titre("Règle 1 — l'argent de la cliente et celui de CLT ne se confondent jamais");

{
  const c = colis({ statut: 'livre', montant_article: 10000, montant_livraison: 1500 });
  verifier("l'article de la cliente est lu seul", montantArticleColis(c) === 10000,
    String(montantArticleColis(c)));
  verifier('les frais de livraison de CLT sont lus seuls', montantLivraisonColis(c) === 1500,
    String(montantLivraisonColis(c)));
  verifier("ce qui revient à la cliente n'inclut jamais les frais de livraison",
    montantArticleEncaisse(c) === 10000 && montantArticleADevoir(c) === 10000,
    `${montantArticleEncaisse(c)} / ${montantArticleADevoir(c)}`);
}
{
  // Les colis anciens n'ont qu'un champ « montant », sans détail. Le lire comme un article
  // est le seul choix honnête : ce montant a toujours désigné le prix de la marchandise.
  const vieux = { statut: 'livre', montant: 8000, montant_article: null, montant_livraison: null };
  verifier("un vieux colis sans détail compte comme un article, pas comme un total mélangé",
    montantArticleColis(vieux) === 8000 && montantLivraisonColis(vieux) === 0,
    `${montantArticleColis(vieux)} / ${montantLivraisonColis(vieux)}`);
}
{
  const t = totauxArgent([
    colis({ statut: 'livre', montant_article: 10000, montant_livraison: 1500 }),
    colis({ statut: 'livre', montant_article: 5000,  montant_livraison: 1000 }),
  ]);
  verifier("les totaux gardent les deux poches séparées jusqu'au bout",
    t.articleEnregistre === 15000 && t.livraisonEnregistree === 2500,
    JSON.stringify({ a: t.articleEnregistre, l: t.livraisonEnregistree }));
  verifier("aucun champ de totauxArgent n'est la somme article + livraison, sauf ceux qui le disent",
    t.articleEncaisse === 15000 && t.livraisonEncaissee === 2500 && t.totalEncaisse === 17500,
    JSON.stringify(t));
}

/* ==========================================================================================
   2. LIVRÉ = ENCAISSÉ, SAUF EXCEPTION
   ========================================================================================== */
titre('Règle 2 — un colis livré compte comme encaissé, sans que personne ait rien à cocher');

{
  const livre = colis({ statut: 'livre', montant_article: 25000 });
  verifier("un colis livré est encaissé d'office — c'était tout le défaut d'avant",
    articleEncaisse(livre) === true && montantArticleEncaisse(livre) === 25000);
}
{
  // La preuve chiffrée du défaut : l'ancienne règle exigeait article_paye, jamais coché.
  const commeAvant = colis({ statut: 'livre', montant_article: 25000, article_paye: false });
  verifier("l'ancienne colonne article_paye n'a plus aucun effet sur le calcul",
    montantArticleEncaisse(commeAvant) === 25000,
    'un colis livré doit compter même avec article_paye = false');
}
{
  const exception = colis({ statut: 'livre', montant_article: 25000, article_non_encaisse: true });
  verifier("l'exception, elle, retire bien l'argent du compte",
    articleEncaisse(exception) === false && montantArticleEncaisse(exception) === 0);
  verifier("et ce manque est nommé, pas simplement effacé",
    montantManquantALaLivraison(exception) === 25000,
    String(montantManquantALaLivraison(exception)));
}
{
  const pasLivre = colis({ statut: 'en_livraison', montant_article: 25000 });
  verifier("un colis en route n'est pas encaissé : l'argent n'est chez personne",
    montantArticleEncaisse(pasLivre) === 0 && montantArticleADevoir(pasLivre) === 0);
  verifier("et il ne compte pas non plus comme un manque — rien n'a encore été remis",
    montantManquantALaLivraison(pasLivre) === 0);
}
{
  // Payé d'avance : les frais de livraison sont encaissés même sans remise.
  const avance = colis({ statut: 'en_livraison', montant_livraison: 1500, livraison_payee: true });
  verifier("une livraison payée d'avance est encaissée avant même la remise",
    livraisonEncaissee(avance) === true && montantLivraisonEncaissee(avance) === 1500);
}

/* ==========================================================================================
   3. ENCAISSÉ N'EST PAS REVERSÉ
   ========================================================================================== */
titre("Règle 3 — « j'ai encaissé pour vous » et « je vous ai payée » sont deux phrases différentes");

{
  const du = colis({ statut: 'livre', montant_article: 25000 });
  verifier("tant que CLT n'a pas reversé, l'argent reste dû à la cliente",
    montantArticleEncaisse(du) === 25000 && montantArticleADevoir(du) === 25000);

  const reverse = colis({ statut: 'livre', montant_article: 25000,
                          reverse_au_fournisseur_at: '2026-08-25T18:00:00Z' });
  verifier("une fois reversé, l'argent reste encaissé mais n'est plus dû",
    montantArticleEncaisse(reverse) === 25000 && montantArticleADevoir(reverse) === 0,
    `${montantArticleEncaisse(reverse)} / ${montantArticleADevoir(reverse)}`);
}
{
  // Le piège d'avant : encaissement_remis veut dire « le LIVREUR a rendu sa caisse à CLT ».
  // La vue le lisait comme « CLT a payé la cliente ». Il ne doit plus rien changer ici.
  const caisseRendue = colis({ statut: 'livre', montant_article: 25000, encaissement_remis: true });
  verifier("la remise de caisse du livreur ne rend pas la cliente payée pour autant",
    montantArticleADevoir(caisseRendue) === 25000,
    'encaissement_remis ne doit pas éteindre la dette envers la cliente');
}

/* ==========================================================================================
   4. ENREGISTRÉ ET ENCAISSÉ NE SE MÉLANGENT PAS
   ========================================================================================== */
titre("Règle 4 — ce qui est enregistré et ce qui est encaissé sont comptés séparément");

{
  const jour = [
    colis({ statut: 'livre',        montant_article: 10000, montant_livraison: 1500 }),
    colis({ statut: 'livre',        montant_article:  5000, montant_livraison: 1000 }),
    colis({ statut: 'en_livraison', montant_article: 20000, montant_livraison: 2000 }),
    colis({ statut: 'en_attente',   montant_article:  3000, montant_livraison:  500 }),
  ];
  const t = totauxArgent(jour);
  verifier('tous les colis comptent dans « enregistré »',
    t.articleEnregistre === 38000 && t.nb === 4, JSON.stringify(t));
  verifier('seuls les colis livrés comptent dans « encaissé »',
    t.articleEncaisse === 15000 && t.nbLivres === 2, JSON.stringify(t));
  verifier("le livreur ne se voit annoncer que l'argent réellement dans sa poche",
    t.totalEncaisse === 17500, String(t.totalEncaisse));
  verifier("un colis en route n'ajoute rien au total en main",
    montantEnMainDuLivreur(jour[2]) === 0, String(montantEnMainDuLivreur(jour[2])));
}
{
  // Le point exact des captures d'écran du 24 août (Lash with Reine, chiffres réels).
  const reine = [];
  for (let i = 0; i < 9; i++) reine.push(colis({ statut: 'livre', montant_article: 34500 / 9, montant_livraison: 12500 / 9 }));
  for (let i = 0; i < 3; i++) reine.push(colis({ statut: 'en_attente', montant_article: 5000, montant_livraison: 0 }));
  const t = totauxArgent(reine);
  verifier('12 colis, 9 livrés : le compte des colis est juste',
    t.nb === 12 && t.nbLivres === 9, JSON.stringify({ nb: t.nb, l: t.nbLivres }));
  verifier("« 62 000 » n'apparaît plus nulle part : c'était article + livraison mélangés",
    Math.round(t.articleEnregistre) === 49500 && Math.round(t.articleEncaisse) === 34500,
    JSON.stringify({ e: t.articleEnregistre, c: t.articleEncaisse }));
  verifier('les frais de CLT sont annoncés à part, pour ce qu\'ils sont',
    Math.round(t.livraisonEncaissee) === 12500, String(t.livraisonEncaissee));
}

/* ==========================================================================================
   5. L'INVARIANT
   ========================================================================================== */
titre('Règle 5 — encaissé = déjà reversé + reste dû, toujours et partout');

{
  // Un échantillon volontairement tordu : exceptions, reversements partiels, vieux colis,
  // montants nuls, colis en route. Si l'égalité tient là, elle tient partout.
  const echantillon = [
    colis({ statut: 'livre',        montant_article: 10000, montant_livraison: 1500 }),
    colis({ statut: 'livre',        montant_article:  7000, reverse_au_fournisseur_at: '2026-08-20T10:00:00Z' }),
    colis({ statut: 'livre',        montant_article:  4000, article_non_encaisse: true }),
    colis({ statut: 'en_livraison', montant_article:  9000, montant_livraison: 1000 }),
    colis({ statut: 'non_livre',    montant_article:  6000 }),
    { statut: 'livre', montant: 8000, montant_article: null, montant_livraison: null },
    colis({ statut: 'livre',        montant_article:     0, montant_livraison: 500 }),
  ];
  const t = totauxArgent(echantillon);

  // Le reversé n'est pas dans totauxArgent (il ne dépend pas du jour) : on le recompose.
  const reverse = echantillon
    .filter(c => articleEncaisse(c) && c.reverse_au_fournisseur_at)
    .reduce((s, c) => s + montantArticleColis(c), 0);

  verifier("l'invariant tient sur un échantillon tordu",
    t.articleEncaisse === reverse + t.articleADevoir,
    `${t.articleEncaisse} ≠ ${reverse} + ${t.articleADevoir}`);
  verifier("le manquant est compté à part, et n'entre pas dans l'encaissé",
    t.manquantALaLivraison === 4000 && t.articleEncaisse === 25000,
    JSON.stringify({ m: t.manquantALaLivraison, e: t.articleEncaisse }));
  verifier("un total encaissé ne dépasse jamais un total enregistré",
    t.articleEncaisse <= t.articleEnregistre && t.livraisonEncaissee <= t.livraisonEnregistree,
    JSON.stringify(t));
}
{
  const vide = totauxArgent([]);
  verifier('sur zéro colis, tout vaut zéro — et rien ne vaut NaN',
    Object.values(vide).every(v => v === 0),
    JSON.stringify(vide));
  const cassé = totauxArgent([null, undefined, {}, { statut: 'livre' }]);
  verifier('des lignes incomplètes ne produisent jamais de NaN dans un total',
    Object.values(cassé).every(v => Number.isFinite(v)),
    JSON.stringify(cassé));
}

/* ==========================================================================================
   6. CE QUE L'ÉCRAN DIT DE L'ÉTAT D'UN COLIS
   ========================================================================================== */
titre("Les mots posés sur un colis décrivent son état réel, pas un état moyen");

{
  const cas = [
    [colis({ statut: 'en_attente', montant_article: 5000 }),                                   'Pas encore encaissé'],
    [colis({ statut: 'en_livraison', montant_livraison: 1500, livraison_payee: true }),        "Livraison payée d'avance"],
    [colis({ statut: 'livre', montant_article: 5000 }),                                        'Encaissé'],
    [colis({ statut: 'livre', montant_article: 5000, article_non_encaisse: true }),            'Argent non encaissé'],
    [colis({ statut: 'livre', montant_article: 5000, reverse_au_fournisseur_at: '2026-08-25T10:00:00Z' }), 'Encaissé et reversé'],
  ];
  cas.forEach(([c, attendu]) => {
    verifier(`« ${attendu} » est bien ce qui s'affiche dans ce cas`,
      paiementInfo(c).label === attendu, `obtenu : ${paiementInfo(c).label}`);
  });
  verifier('un colis absent ne fait pas planter la ligne, il affiche un tiret',
    paiementInfo(null).label === '—');
}

/* ==========================================================================================
   7. LA LIGNE DE TOTAL EST BIEN LÀ, SUR CHAQUE TABLEAU D'ARGENT
   ==========================================================================================
   C'est la demande initiale : « dans le tableau, à la fin, il doit avoir une dernière ligne
   pour donner le total exact ». Un total qu'on doit refaire de tête est un total qu'on refait
   faux un soir de fatigue. */
titre('Chaque tableau d\'argent porte sa ligne de total');

{
  const html = piedTotalHTML([{ texte: 'TOTAL' }, { texte: '49 500 FCFA', couleur: '#1a7d3c' }]);
  verifier('le pied de tableau est un vrai <tfoot>, pas une ligne de corps déguisée',
    html.startsWith('<tfoot>') && html.includes('</tfoot>'), html);
  verifier('il porte la classe qui le fait ressortir visuellement',
    html.includes('recap-total-row'), html);
  verifier('la couleur demandée est appliquée à la bonne cellule',
    html.includes('color:#1a7d3c') && html.includes('49 500 FCFA'), html);
  verifier('une cellule vide reste vide, sans « undefined » affiché à l\'écran',
    !piedTotalHTML([{}, null]).includes('undefined'), piedTotalHTML([{}, null]));
}
{
  const tableaux = [
    ['équipe · récapitulatif par client (le tableau visé par la demande)', equipe, 'renderRecapBilan'],
    ['équipe · comptabilité',                                             equipe, 'renderCompta'],
    ['livreur · l\'argent de ma journée',                                 livreur, 'renderArgentDuJour'],
  ];
  tableaux.forEach(([nom, src, fn]) => {
    const bloc = blocDe(src, fn);
    verifier(`${nom} : la ligne de total est présente`,
      bloc.includes('piedTotalHTML'), `piedTotalHTML absent de ${fn}()`);
  });
}

/* ==========================================================================================
   8. AUCUN ÉCRAN N'A GARDÉ UNE ANCIENNE FAÇON DE COMPTER
   ==========================================================================================
   Une règle d'argent écrite une seule fois dans config.js ne sert à rien si un écran garde sa
   propre version dans un coin. C'est exactement comme cela que « Montant total » avait fini
   par vouloir dire deux choses différentes selon la page. */
titre("Personne ne recalcule l'argent dans son coin");

{
  const pages = [['equipe.html', equipe], ['fournisseur.html', fournisseur], ['livreur.html', livreur]]
    .map(([nom, src]) => [nom, sansCommentaires(src)]);
  const fournisseurNu = sansCommentaires(fournisseur);
  const livreurNu = sansCommentaires(livreur);

  pages.forEach(([nom, src]) => {
    verifier(`${nom} ne redéfinit pas sa propre version de montantArticleColis`,
      !/function\s+montantArticleColis\s*\(/.test(src),
      'une copie locale finit toujours par diverger de config.js');
  });

  // article_paye : la colonne est retirée du calcul ET de toutes les écritures.
  pages.forEach(([nom, src]) => {
    const restes = (src.match(/article_paye/g) || []).length;
    verifier(`${nom} n'écrit ni ne lit plus article_paye`, restes === 0,
      `${restes} occurrence(s) restante(s)`);
  });

  // Le mot « Montant total » sur un écran de cliente désignait article + livraison.
  verifier("l'espace cliente n'affiche plus de « Montant total » mélangé",
    !/Montant total/.test(fournisseurNu),
    'ce libellé recouvrait une somme qui n\'était l\'argent de personne');
  verifier("l'espace cliente n'affiche plus de « Montant livré » ambigu",
    !/Montant livré/.test(fournisseurNu));
  verifier("l'espace cliente dit d'abord « vos articles »",
    /Vos articles|Votre article/.test(fournisseurNu));

  // Le livreur doit pouvoir voir l'argent de sa journée : c'est la demande explicite.
  verifier("le livreur a un écran pour l'argent de sa journée",
    /renderArgentDuJour/.test(livreurNu) && /argent-jour-card/.test(livreurNu));
  verifier("cet écran est bien branché sur le rendu général, sinon il resterait vide",
    /renderAll\(\)\{[\s\S]{0,200}renderArgentDuJour\(\)/.test(livreurNu),
    'renderArgentDuJour() doit être appelé depuis renderAll()');
  verifier("le livreur peut signaler un article non encaissé, sur place",
    /btn-article-non-encaisse/.test(livreurNu) && /article_non_encaisse/.test(livreurNu));
}

/* ==========================================================================================
   9. LE SCRIPT DE BASE DIT LA MÊME CHOSE QUE LES ÉCRANS
   ==========================================================================================
   _sql-prive/ est hors dépôt (les fichiers .sql sont ignorés par git). Sur un clone propre —
   l'intégration continue, par exemple — ce contrôle n'a rien à lire : il s'efface proprement
   au lieu de faire échouer toute la série. */
titre('Le relevé calculé en base suit la même règle que les écrans');

{
  const CHEMIN_SQL = path.join(RACINE, '_sql-prive', 'argent-regle-claire.sql');
  if (!fs.existsSync(CHEMIN_SQL)) {
    ignorer('la comparaison avec le script de base (section 9)',
      'Le dossier _sql-prive n\'est pas versionné (voir .gitignore). Le contrôle ne peut s\'exécuter que sur le poste où le script existe.');
  } else {
    const sql = sansCommentairesSQL(fs.readFileSync(CHEMIN_SQL, 'utf8'));
    verifier('les trois colonnes de la nouvelle règle sont créées',
      /article_non_encaisse/.test(sql) && /livraison_non_encaissee/.test(sql) &&
      /reverse_au_fournisseur_at/.test(sql));
    verifier('la vue du relevé ne s\'appuie plus sur article_paye',
      !/filter\s*\([^)]*article_paye/.test(sql),
      'la colonne jamais cochée ne doit plus décider de rien');
    verifier('« déjà reversé » lit la date de reversement, pas la remise de caisse du livreur',
      /deja_reverse[\s\S]{0,80}/.test(sql) &&
      /reverse_au_fournisseur_at is not null\), 0::numeric\)\s+as deja_reverse/.test(sql),
      'confondre les deux revient à dire à une cliente qu\'elle a été payée');
    verifier('le filtre « montant_article is not null » a disparu du relevé',
      !/where montant_article is not null/.test(sql),
      'il faisait diverger le nombre de colis livrés entre le relevé et l\'écran de la cliente');
    verifier('le script vérifie lui-même l\'invariant avant qu\'on referme l\'onglet',
      /total_encaisse_pour_vous <> deja_reverse \+ reste_a_percevoir/.test(sql));
    verifier('article_paye est retiré de ce que la cliente peut écrire',
      !/'article_paye'/.test(sql),
      'une porte laissée ouverte sur une colonne qu\'on ne lit plus n\'est surveillée par personne');
    verifier('la liste blanche de l\'espace client est bien réécrite en entier, pas rapiécée',
      /v_libres := array\[[\s\S]{0,400}'livraison_payee'/.test(sql),
      'une fonction modifiée par remplacement de texte ne se relit plus');
  }
}

/* ==========================================================================================
   9 bis. AUCUN CHIFFRE NE PORTE UN NOM AMBIGU

   Trouvé à la relecture du 25 août, alors que tout le reste était déjà vert : deux fiches
   colis de l'espace équipe affichaient encore « Article : … · Livraison : … · Total : … ».
   Le calcul était juste — c'est bien ce que le destinataire tend au livreur — mais « Total »
   est précisément le mot qui a mis des mois à vouloir dire deux choses différentes selon
   l'écran. Un chiffre juste sous un nom ambigu se recopie aussi mal qu'un chiffre faux. Il
   s'appelle maintenant « Le destinataire remet ».

   Même chose pour « Reste à percevoir », resté dans l'en-tête d'un export Excel : il disait
   à l'équipe que la cliente devait aller chercher son argent, alors que c'est CLT qui le lui
   doit.
   ========================================================================================== */
titre('Aucun chiffre ne porte un nom ambigu');
{
  const ecrans = [['équipe', equipe], ['cliente', fournisseur], ['livreur', livreur]];
  for (const [nom, src] of ecrans) {
    const code = sansCommentaires(src);
    verifier(`espace ${nom} : plus de libellé « Total : » posé sur les deux poches réunies`,
      !/Total\s*:\s*\$\{formatMontant\(montantTotalColis/.test(code),
      'ce total ne vaut que dans la poche du livreur ; il faut le nommer pour ce qu\'il est');
    verifier(`espace ${nom} : « à percevoir » n'est plus écrit nulle part`,
      !/à percevoir/i.test(code),
      'c\'est CLT qui doit ; la cliente n\'a rien à aller percevoir');
  }
  verifier('l\'export comptable par vendeuse annonce « À reverser à la cliente »',
    /'Vendeuse','Colis','Articles','À reverser à la cliente'/.test(equipe),
    'l\'en-tête d\'un tableau exporté survit bien plus longtemps que l\'écran qui l\'a produit');
  verifier('montantTotalColis existe toujours, et seulement dans config.js',
    /function montantTotalColis\s*\(/.test(sourceConfig) &&
    ecrans.every(([, src]) => !/function\s+montantTotalColis\s*\(/.test(src)),
    'le supprimer priverait le livreur du seul chiffre qui compte pour lui : ce qu\'on lui tend');
}

/* ==========================================================================================
   10. LES ÉTIQUETTES DE VERSION
   ========================================================================================== */
titre('Les fichiers partagés portent tous la même étiquette de version');
controlerEtiquettesDeVersion({ APP, verifier });

/* ---------- Verdict ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`
  + (ignorees ? `, ${ignorees} non applicables ici` : ''));
if (echouees) process.exit(1);
