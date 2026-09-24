/* LA BARRE DE RECHERCHE — un seul composant, une seule règle (24 septembre 2026)
   Celtis : « il faut que les barres de recherche soient efficaces et qu'elles pointent là où il
   faut […] dans un compte, quand on clique pour chercher, ça ne sélectionne pas ; on tape, mais
   rien ne cherche […] et vers la fin, le signe de croix qu'on peut cliquer pour effacer ».
   Ce banc fait tourner la règle « un colis correspond » (clt-common.js), relit le composant et
   vérifie qu'aucune page ne redessine un champ de recherche pendant qu'on y tape. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 300) : '')); } }
function blocDe(src, nom) {
  const debut = src.search(new RegExp('function\\s+' + nom + '\\s*\\('));
  if (debut === -1) throw new Error('Fonction ' + nom + ' introuvable');
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) { if (src[i] === '{') prof++; else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); } }
  throw new Error('fin de ' + nom + ' introuvable');
}
const commun = lire('app/clt-common.js');
const bac = { String, Array, RegExp, Object };
vm.runInNewContext(blocDe(commun, 'cltNormaliserTexte') + '\n' + blocDe(commun, 'cltColisCorrespond'), bac);
const ok = (c, t, l) => bac.cltColisCorrespond(c, t, l);
const C = { numero: 'CLT-260916-00052', description: 'Robe brodée', destination: 'Rue 12, près de la pharmacie', commune_destination: 'Yopougon', destinataire_nom: 'Aïcha Koné', destinataire_telephone: '07 98 54 66 62' };

console.log('\n1. La règle « un colis correspond »');
verifier('rien de tapé : tout passe', ok(C, '') && ok(C, '   '));
verifier('sans accent ni majuscule : « aicha kone », « ROBE BRODEE »', ok(C, 'aicha kone') && ok(C, 'ROBE BRODEE'));
verifier('le téléphone tapé sans espaces trouve le numéro enregistré avec', ok(C, '0798546662') && ok(C, '98 54 66') && ok(C, '5466'));
verifier('le n° de suivi sans tirets : « 26091600052 »', ok(C, '26091600052') && ok(C, 'clt-260916') && ok(C, '00052'));
verifier('deux mots : chacun doit se trouver (« yopougon robe » oui, « yopougon veste » non)', ok(C, 'yopougon robe') && !ok(C, 'yopougon veste'));
verifier('le nom de la cliente, passé à part, compte aussi', ok(C, 'awa boutique', 'Awa Boutique') && !ok(C, 'awa boutique', ''));
verifier('un colis vide ne casse rien', ok({}, 'x') === false && ok(null, 'x') === true);

console.log('\n2. Trois écrans, une règle : matchesSearch passe par cltColisCorrespond');
['app/equipe/00-etat-et-caisse.js', 'app/livreur.html', 'app/fournisseur.html'].forEach((f) => {
  const m = lire(f).match(/function matchesSearch\(c, term\)\{[^\n]*\}/);
  verifier(f + ' délègue à la règle commune', m && /cltColisCorrespond\(c, term/.test(m[0]), m && m[0]);
});

console.log('\n3. Le composant : une croix ✕ pour effacer, Échap, sans doublon');
verifier('clt-common.js équipe input[type=search] et .search-input, y compris ceux qui naissent plus tard (MutationObserver)', /const SEL = 'input\[type="search"\], input\.search-input'/.test(commun) && /new MutationObserver\(\(mutations\)/.test(commun) && /window\.cltEquiperRecherche = equiperTout/.test(commun));
verifier('la croix vide le champ et relance la recherche (input + search), et garde le focus (mousedown)', /dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/.test(commun) && /x\.addEventListener\('mousedown', \(e\) => \{ e\.preventDefault\(\); effacer\(\); input\.focus\(\); \}\)/.test(commun));
verifier('Échap efface aussi', /e\.key === 'Escape' && input\.value/.test(commun));
const css = lire('app/style.css');
verifier('le style : croix de 44 px, visible seulement quand il y a du texte, croix native masquée', /\.clt-rech-x\{[^}]*width:44px; height:44px/.test(css) && /\.clt-rech--pleine > \.clt-rech-x\{ display:flex; \}/.test(css) && /-webkit-search-cancel-button[^}]*display:none/.test(css));

console.log('\n4. Un champ de recherche n’est jamais redessiné pendant la frappe');
verifier('cltPoserHTML rend son texte, son curseur et le focus à un champ redessiné (filet de sécurité)', /const actif = typeof document !== 'undefined' \? document\.activeElement : null;[\s\S]{0,700}nouveau\.setSelectionRange\(garder\.debut, garder\.fin\)/.test(commun));
const recap = lire('app/equipe/06-corrections-et-tournee.js');
verifier('Suivi › clientes : trois zones (haut, champ posé une fois, liste), plus de focus() après rendu', /id="recap-haut"><\/div><div id="recap-recherche"><\/div><div id="recap-liste">/.test(recap) && /if \(!document\.getElementById\('recap-search'\)\) \{ cltPoserHTML\(zoneRech, recapSearchBarHTML\(\)\); wireRecapSearch\(\); \}/.test(recap) && !/again\.focus\(\)/.test(recap));
verifier('… et cherche sans accent, sur le nom ET le téléphone', /cltNormaliserTexte\(fournisseurLabelPlain\(c\.id\) \+ ' ' \+ \(p && p\.phone/.test(recap));
const recapl = lire('app/equipe/07-rapports.js');
verifier('Suivi › livreurs : même découpage', /id="recapl-haut"><\/div><div id="recapl-recherche"><\/div><div id="recapl-liste">/.test(recapl) && /if \(!document\.getElementById\('recapl-search'\)\)/.test(recapl) && !/again\.focus\(\)/.test(recapl));
const four = lire('app/fournisseur.html');
verifier('Cliente › Mes boutiques : le champ n’est posé qu’une fois, le corps se redessine', /if \(!detail\.querySelector\('#mb-recherche'\)\)/.test(four) && /getElementById\('mb-corps'\)\.innerHTML/.test(four) && !/champ\.focus\(\); try \{ champ\.setSelectionRange\(debut/.test(four));
verifier('Gestion › clientes et livreurs : sans accent, téléphone sans espaces', /cltNormaliserTexte\(cdRecherche\)/.test(lire('app/clients-dashboard.js')) && /cltNormaliserTexte\(ldRecherche\)/.test(lire('app/livreurs-dashboard.js')));
verifier('le parcours navigateur existe et est lancé par GitHub', fs.existsSync(path.join(RACINE, 'tests/parcours/la-barre-de-recherche.mjs')) && /'la-barre-de-recherche\.mjs'/.test(lire('tests/parcours/lancer.mjs')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
