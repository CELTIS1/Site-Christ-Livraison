/* UN REÇU NUMÉROTÉ POUR CHAQUE REVERSEMENT — 18 septembre 2026 (feuille de route 10.3)
   ==========================================================================================
   « La cliente reçoit un récapitulatif sans numéro ni valeur de pièce comptable. Un reçu
   numéroté, gardé des deux côtés. »

   Le reçu existait depuis le 05/09 (table reversements_clientes) ; il lui manquait le numéro,
   et la vendeuse ne le voyait pas. De son côté, l'écran lisait une vue qui ADDITIONNE PAR JOUR :
   deux remises le même jour n'en faisaient qu'une, et elle n'avait rien à citer au téléphone.

   Ce banc tient ce qui ne demande pas de base :
     1. le document est écrit UNE fois et imprimé des deux côtés ;
     2. il dit le numéro, le détail, le total — et jamais les frais de livraison ;
     3. un reçu annulé s'imprime quand même, marqué ;
     4. les deux écrans le produisent par la même fonction, et lisent les reçus, pas un résumé.
   La numérotation elle-même (continue, sans trou) est éprouvée dans un vrai Postgres :
   tests/recu-numerote/essai-en-postgres.py.

   Lancer à la main :  node tests/un-recu-numerote.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const lire = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const papier = lire('lib/papier-a-en-tete.js');
const fournisseur = lire('fournisseur.html');
const clients = lire('clients-dashboard.js');
const equipe = lire('equipe.html');

let reussies = 0, echouees = 0, ignorees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
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

/* On exécute vraiment recuDeReversementPDF, avec un faux documentCLT qui note le PLAN reçu :
   ce qui nous intéresse est ce que le reçu DIT, pas comment jsPDF le dessine. */
const ctx = vm.createContext({ console, Date, Number, String, Array, Math, Object, RegExp });
vm.runInContext(papier.match(/const LIBELLE_MODE_REVERSEMENT = \{[\s\S]*?\n\};/)[0], ctx);
/* formatMontant est celui de clt-common.js, pas un double écrit ici. Un double « à peu près »
   aurait séparé les milliers par une espace ordinaire là où le vrai emploie l'espace fine
   insécable de fr-FR : le banc aurait cherché « 35 000 » dans un document qui dit « 35 000 »
   avec un autre caractère, et accusé le reçu d'une erreur qu'il n'a pas. (18/09/2026) */
vm.runInContext(blocDe(fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8'), 'formatMontant', 'clt-common.js'), ctx);
vm.runInContext(`
  let dernierPlan = null;
  function documentCLT(plan) { dernierPlan = plan; return Promise.resolve({ plan: plan, save(){} }); }
  function montantArticleColis(c) { return Number(c.montant_article) || 0; }
`, ctx);
vm.runInContext([blocDe(papier, 'recuDeReversementPDF', 'papier-a-en-tete.js'),
                 blocDe(papier, 'recuNomFichier', 'papier-a-en-tete.js')].join('\n\n'), ctx);
const { recuDeReversementPDF, recuNomFichier } = ctx;

const COLIS = [
  { id: 'a', numero: 'CLT-260915-01700', description: 'Deux robes', commune_destination: 'Cocody', destination: 'Riviera 2', montant_article: 20000, montant_livraison: 1500 },
  { id: 'b', numero: 'CLT-260915-01701', description: 'Un sac', commune_destination: 'Yopougon', destination: 'Niangon', montant_article: 15000, montant_livraison: 1500 },
];
const RECU = {
  id: 'r1', numero: 'REV-2026-0004', montant: 35000, nb_colis: 2, colis_ids: ['a', 'b'],
  mode: 'wave', note: 'remis en main propre', fait_le: '2026-09-18T10:30:00Z', annule_le: null,
};

titre('1. Ce que le reçu dit');
{
  const plan = (await recuDeReversementPDF({ recu: RECU, colis: COLIS, clienteNom: 'Awa Boutique' })).plan;
  verifier('c\'est bien un reçu, et il porte son numéro en évidence',
    plan.titre === 'Reçu de reversement' && plan.sousTitre === 'REV-2026-0004', JSON.stringify([plan.titre, plan.sousTitre]));
  verifier('la cliente et la date sont nommées', /Awa Boutique/.test(plan.mention) && /18 septembre 2026/.test(plan.mention), plan.mention);
  verifier('chaque colis soldé est détaillé, avec son numéro',
    plan.tableau.body.length === 2 && plan.tableau.body[0][0] === 'CLT-260915-01700', JSON.stringify(plan.tableau.body[0]));
  const M35 = ctx.formatMontant(35000);
  verifier('le total est celui du reçu, pas une addition refaite sur place',
    plan.tableau.foot[0][3] === M35, JSON.stringify(plan.tableau.foot) + ' (attendu ' + M35 + ')');
  const texte = plan.apres.map(a => a.texte).join(' | ');
  verifier('la somme remise est annoncée en toutes lettres',
    texte.indexOf('Somme remise à Awa Boutique : ' + M35) !== -1, texte);
  verifier('le mode de remise est écrit en français, pas en code', /Mode de remise : Wave/.test(texte), texte);
  verifier('la note du bureau suit le mode', /remis en main propre/.test(texte), texte);
}

titre('2. Ce que le reçu NE dit PAS : les frais de livraison');
{
  const plan = (await recuDeReversementPDF({ recu: RECU, colis: COLIS, clienteNom: 'Awa Boutique' })).plan;
  const tout = JSON.stringify(plan);
  // 3 000 F de frais sur ces deux colis : ils sont le revenu de CLT, pas l'argent de la cliente.
  // Les faire figurer sur ce qu'on lui remet donnerait un chiffre qui n'est l'argent de personne.
  verifier('aucun montant de livraison ne figure sur le reçu',
    tout.indexOf(ctx.formatMontant(1500)) === -1 && tout.indexOf(ctx.formatMontant(3000)) === -1, tout.slice(0, 200));
  verifier('et le reçu explique pourquoi, plutôt que de laisser la question ouverte',
    /Les frais de livraison ne figurent pas sur ce reçu/.test(tout));
  verifier('le total du reçu est exactement la somme des articles (20 000 + 15 000)',
    RECU.montant === COLIS.reduce((s, c) => s + c.montant_article, 0));
}

titre('3. Un reçu annulé s\'imprime quand même, et se voit');
{
  const annule = Object.assign({}, RECU, { annule_le: '2026-09-18T14:00:00Z', annule_motif: 'erreur de cliente' });
  const plan = (await recuDeReversementPDF({ recu: annule, colis: COLIS, clienteNom: 'Awa Boutique' })).plan;
  const premier = plan.apres[0];
  verifier('la première chose qu\'on lit est qu\'il est annulé', /REÇU ANNULÉ/.test(premier.texte), premier.texte);
  verifier('avec sa date et son motif', /18 septembre 2026/.test(premier.texte) && /erreur de cliente/.test(premier.texte), premier.texte);
  verifier('en rouge, et non dans le vert de la somme remise', premier.couleur.join(',') === '192,57,43', String(premier.couleur));
  verifier('il garde son numéro : une pièce comptable ne se réutilise pas', plan.sousTitre === 'REV-2026-0004');
}

titre('4. Quand le détail manque, le reçu le dit au lieu d\'inventer');
{
  const plan = (await recuDeReversementPDF({ recu: RECU, colis: [], clienteNom: 'Awa Boutique' })).plan;
  verifier('pas de lignes inventées', plan.tableau.body.length === 1);
  verifier('le nombre de colis et le montant restent justes',
    /2 colis/.test(plan.tableau.body[0][0]) && plan.tableau.foot[0][0] === ctx.formatMontant(35000),
    JSON.stringify(plan.tableau));
  verifier('et la phrase le dit franchement', /le détail n'est pas joint/.test(plan.tableau.body[0][0]), plan.tableau.body[0][0]);
}

titre('5. Le nom du fichier se retrouve');
{
  verifier('il porte le numéro de la pièce', recuNomFichier(RECU) === 'recu-rev-2026-0004.pdf', recuNomFichier(RECU));
  verifier('et il ne tombe jamais vide', recuNomFichier(null) === 'recu-reversement.pdf', recuNomFichier(null));
}

titre('6. Les deux écrans impriment le MÊME papier');
{
  verifier('le bureau appelle la fonction commune', /recuDeReversementPDF\(\{ recu: recu, colis: colis, clienteNom: nom \}\)/.test(clients));
  verifier('la cliente aussi', /recuDeReversementPDF\(\{/.test(fournisseur) && /recuNomFichier\(recu\)/.test(fournisseur));
  verifier('aucun des deux ne redessine un reçu de son côté',
    !/documentCLT\(\{[\s\S]{0,200}Reçu de reversement/.test(clients + fournisseur));
  verifier('les deux demandent jsPDF au clic, et disent quand il manque',
    /assurerJsPDF/.test(clients) && /assurerJsPDF/.test(fournisseur)
    && /Reçu non produit/.test(clients) && /Reçu non produit/.test(fournisseur));
  verifier('les libellés des modes ne sont plus recopiés dans l\'écran du bureau',
    /const CD_MODE_LIB = LIBELLE_MODE_REVERSEMENT;/.test(clients)
    && !/\['especes', 'Espèces'\]/.test(clients));
}

titre('7. La cliente lit ses reçus, plus un résumé par jour');
{
  verifier('l\'écran lit la table des reçus', /\.from\('reversements_clientes'\)/.test(fournisseur));
  verifier('et non plus la vue qui additionne par jour',
    !/from\('historique_reversements_fournisseur'\)/.test(fournisseur));
  verifier('il demande le numéro', /select\('id, numero, montant, nb_colis, colis_ids, mode, note, fait_le, annule_le, annule_motif'\)/.test(fournisseur));
  verifier('le bloc s\'appelle « Mes reçus de reversement »', /Mes reçus de reversement/.test(fournisseur));
  verifier('un reçu annulé reste dans sa liste, barré',
    /recu-ligne--annule/.test(fournisseur) && /text-decoration:line-through/.test(fournisseur));
  verifier('le bouton de téléchargement fait 44 px', /\.recu-telecharger\{ min-height:44px/.test(fournisseur));
  verifier('et le numéro est lisible au bureau comme chez elle',
    /cd-rev-numero/.test(clients) && /cd-rev-numero\{/.test(equipe) && /recu-numero\{/.test(fournisseur));
}

titre('8. La migration dit ce qu\'elle promet');
{
  const fichier = path.join(RACINE, '_sql-prive', '2026-09-18-un-recu-numerote.sql');
  if (!fs.existsSync(fichier)) {
    ignorer('la migration est lisible', '_sql-prive n\'est pas dans le dépôt public');
  } else {
    const sql = fs.readFileSync(fichier, 'utf8');
    verifier('la colonne est ajoutée sans casser une base en service',
      /add column if not exists numero text/.test(sql));
    verifier('le numéro est unique, garanti par la base',
      /create unique index if not exists reversements_clientes_numero_unique/.test(sql));
    verifier('AUCUNE séquence : c\'est la leçon des numéros de colis du 17/09',
      !/create sequence|nextval/.test(sql) && /pg_advisory_xact_lock/.test(sql));
    verifier('le numéro est pris APRÈS tous les refus, pour ne pas laisser de trou',
      /Un reversement qui n'aboutit pas[\s\S]{0,120}trou/.test(sql));
    verifier('les reçus déjà écrits sont numérotés dans l\'ordre des dates',
      /where numero is null[\s\S]{0,80}order by fait_le/.test(sql));
    verifier('le numéroteur n\'est pas ouvert aux comptes connectés',
      /revoke all on function public\.numero_reversement_suivant\(timestamptz\) from public, anon, authenticated/.test(sql));
    verifier('la migration s\'inscrit au registre',
      /migration_appliquee\('2026-09-18-un-recu-numerote\.sql'/.test(sql));
  }
}

console.log(`\n${reussies} réussie${reussies > 1 ? 's' : ''}, ${echouees} échouée${echouees > 1 ? 's' : ''}`
  + (ignorees ? `, ${ignorees} ignorée${ignorees > 1 ? 's' : ''}.` : '.'));
process.exit(echouees ? 1 : 0);
