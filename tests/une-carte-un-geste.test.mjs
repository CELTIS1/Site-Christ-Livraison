/* UNE CARTE = UN GESTE — 10 septembre 2026 (feuille de route 2.1)
   ==========================================================================================
   Marquer un colis livré demandait trois gestes : ouvrir la liste, choisir, Enregistrer. La carte
   du livreur porte maintenant UN bouton principal qui dit l'étape suivante, un second pour l'échec,
   et tout le reste sous « Plus d'options ». Ce banc exécute la règle de l'étape suivante
   (prochaineEtape / etapeEchec, config.js) sur chaque état, pour un colis d'Abidjan et pour une
   expédition, puis relit la carte et le lien profond.

   Lancer à la main :  node tests/une-carte-un-geste.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const config = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }
function blocDe(src, nom, ouQuoi){
  const debut = src.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans ${ouQuoi}`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  process.exit(1);
}
function declarationDe(src, nom){
  const debut = src.indexOf('const ' + nom + ' =');
  let prof = 0;
  for (let i = debut; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(' || ch === '{' || ch === '[') prof++;
    if (ch === ')' || ch === '}' || ch === ']') prof--;
    if (ch === ';' && prof === 0) return src.slice(debut, i + 1);
  }
  process.exit(1);
}

const ctx = vm.createContext({});
vm.runInContext([
  declarationDe(config, 'STATUTS'), declarationDe(config, 'STATUTS_EXPEDITION'), declarationDe(config, 'ETATS_EXPEDITION'),
  "const COMMUNE_EXPEDITION = 'Expédition (intérieur)';",
  blocDe(config, 'estExpedition', 'config.js'), blocDe(config, 'libelleStatut', 'config.js'),
  blocDe(config, 'prochaineEtape', 'config.js'), blocDe(config, 'etapeEchec', 'config.js'),
].join('\n'), ctx);
const prochaine = vm.runInContext('prochaineEtape', ctx), echec = vm.runInContext('etapeEchec', ctx);
const abidjan = (statut) => ({ statut, commune_destination: 'Cocody' });
const expedition = (statut) => ({ statut, commune_destination: 'Expédition (intérieur)' });

titre("L'étape suivante d'un colis d'Abidjan");
verifier('en attente → « 📦 Récupéré »', JSON.stringify(prochaine(abidjan('en_attente'))) === JSON.stringify({ statut: 'recupere', libelle: '📦 Récupéré' }));
verifier('récupéré → « 🚚 Je pars livrer »', JSON.stringify(prochaine(abidjan('recupere'))) === JSON.stringify({ statut: 'en_livraison', libelle: '🚚 Je pars livrer' }));
verifier('en livraison → « ✅ Livré »', JSON.stringify(prochaine(abidjan('en_livraison'))) === JSON.stringify({ statut: 'livre', libelle: '✅ Livré' }));
verifier('livré, non livré, retour : plus de bouton principal', prochaine(abidjan('livre')) === null && prochaine(abidjan('non_livre')) === null && prochaine(abidjan('retour')) === null && prochaine(null) === null);
verifier('« ⚠️ Non livré » seulement quand le colis est en route (récupéré, en livraison)',
  echec(abidjan('recupere')).statut === 'non_livre' && echec(abidjan('en_livraison')).libelle === '⚠️ Non livré' && echec(abidjan('en_attente')) === null && echec(abidjan('livre')) === null && echec(abidjan('non_livre')) === null);

titre("L'étape suivante d'une expédition : pas de « en livraison »");
verifier('récupéré → « 🚌 Expédié » directement (statut livre en base)', JSON.stringify(prochaine(expedition('recupere'))) === JSON.stringify({ statut: 'livre', libelle: '🚌 Expédié' }));
verifier('l\'échec dit « Non expédié »', echec(expedition('recupere')).libelle === '⚠️ Non expédié');
verifier('une expédition qui serait quand même « en livraison » va à « ✅ Expédié »', prochaine(expedition('en_livraison')).statut === 'livre' && /Expédié/.test(prochaine(expedition('en_livraison')).libelle));

titre('La carte du livreur');
{
  const carte = blocDe(livreur, 'mesColisRowHTML', 'livreur.html');
  verifier('le bouton principal porte la classe verte quand l\'étape est « livre », et data-etape', /btn-etape btn-etape-principale\$\{p\.statut === 'livre' \? ' btn-etape-livre' : ''\}" data-etape="\$\{escapeHTML\(p\.statut\)\}"/.test(carte));
  verifier('le bouton d\'échec est en contour', /btn btn-outline btn-etape btn-etape-echec/.test(carte));
  verifier('sans étape ni échec (colis fini), aucun bloc de boutons', /if \(!p && !e\) return '';/.test(carte));
  verifier('la liste des états et « Enregistrer » sont sous « Plus d\'options »', carte.indexOf('<summary>Plus d\'options</summary>') < carte.indexOf('<select class="status-select">') && carte.indexOf('<select class="status-select">') < carte.indexOf('btn-save'));
  verifier('les boutons ont 44 px au moins (style.css .colis-etapes .btn)', /\.colis-etapes \.btn\{[^}]*min-height:44px/.test(fs.readFileSync(path.join(APP, 'style.css'), 'utf8')));
}

titre('Le lien d\'une notification aboutit toujours');
verifier('si le colis n\'est pas dans la journée affichée, la liste passe à « Tous » une fois (onMiss)', /cltFocusColisFromUrl\(\{ onMiss: \(\) => \{[\s\S]{0,600}activeFilterMes = 'tous'; filtreDateMes = '';[\s\S]{0,400}renderMesColis\(\);/.test(livreur));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
