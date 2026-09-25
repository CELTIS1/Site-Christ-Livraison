/* L'ASSISTANT — chantier Q, 25 septembre 2026
   ==========================================================================================
   Propositions § 4 : un bouton flottant « casque » dans chaque espace ; étage 1 il répond avec
   l'aide (fiches, vidéos), étage 2 avec les données de la personne, et toujours un humain sur
   WhatsApp avec le contexte. Ce banc garde les règles pures et le branchement.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}
const ctx = vm.createContext({ window: {}, console, setTimeout, fetch: () => Promise.reject('hors ligne') });
vm.runInContext(lire('app/assistant.js'), ctx);
const A = ctx.window.CLTAssistant;
const aide = JSON.parse(lire('app/aide.json'));
const articles = (esp) => [].concat(aide.espaces[esp].articles, aide.espaces.tous.articles);

console.log('\n1. Chercher dans l\'aide avec les mots de la personne (étage 1)');
verifier('normaliser : accents, majuscules, ponctuation', A.normaliser('  Où EST ma Course ?! ') === 'ou est ma course');
const r1 = A.chercherFiches('comment recharger mon solde', articles('express-coursier'));
verifier('« comment recharger mon solde » → la fiche du solde en premier', r1.length && r1[0].id === 'coursier-solde', JSON.stringify(r1.map(x => x.id)));
const r2 = A.chercherFiches('c\'est quoi le code de livraison', articles('express-client'));
verifier('« c\'est quoi le code de livraison » → la fiche du code, avec sa vidéo', r2.length && r2[0].id === 'express-code' && r2[0].video === true, JSON.stringify(r2.map(x => x.id)));
const r3 = A.chercherFiches('un colis revient que faire', articles('livreur'));
verifier('« un colis revient que faire » (livreur) → rendre un colis revenu', r3.length && r3[0].id === 'livreur-retour', JSON.stringify(r3.map(x => x.id)));
const r4 = A.chercherFiches('demander un passage demain', articles('fournisseur'));
verifier('« demander un passage demain » (cliente) → annoncer / demander un passage', r4.length && r4[0].id === 'cliente-annoncer', JSON.stringify(r4.map(x => x.id)));
verifier('au plus trois fiches, jamais de score nul, rien pour du charabia', A.chercherFiches('xyzzy plugh', articles('livreur')).length === 0 && A.chercherFiches('colis', articles('livreur')).length <= 3);

console.log('\n2. Les intentions sur les données (étage 2), par espace');
verifier('client Express : « où est ma course ? » → course ; « le code ? » → code', A.intention('Où est ma course ?', 'express-client') === 'course' && A.intention('le code de livraison ?', 'express-client') === 'code');
verifier('coursier : « mon solde ? » → solde ; « mes courses en cours » → course', A.intention('Mon solde ?', 'express-coursier') === 'solde' && A.intention('mes courses en cours', 'express-coursier') === 'course');
verifier('cliente : « combien CLT me doit ? » → relevé ; « où en sont mes colis ? » → journée', A.intention('Combien CLT me doit ?', 'fournisseur') === 'releve' && A.intention('Où en sont mes colis ?', 'fournisseur') === 'journee');
verifier('livreur : « ma journée ? » → journée ; équipe : « qu\'est-ce qui attend ? » → à traiter', A.intention('Ma journée ?', 'livreur') === 'journee' && A.intention('Qu\'est-ce qui attend ?', 'equipe') === 'a_traiter');
verifier('« je veux parler à quelqu\'un » → humain, quel que soit l\'espace ; une question d\'aide → null (étage 1)', A.intention('je veux parler à quelqu\'un', 'livreur') === 'humain' && A.intention('comment livrer avec la photo', 'livreur') === null);
verifier('une intention ne traverse pas les espaces (« mon solde » chez la cliente n\'est pas le solde du coursier)', A.intention('mon solde', 'fournisseur') !== 'solde');
verifier('trois suggestions par espace, dont Express client et coursier', ['livreur', 'fournisseur', 'equipe', 'express-client', 'express-coursier'].every(e => A.SUGGESTIONS[e].length === 3));

console.log('\n3. Le branchement');
for (const p of ['app/livreur.html', 'app/fournisseur.html', 'app/equipe.html', 'app/gestion.html', 'app/express-client.html', 'app/express-coursier.html']) {
  verifier(p + ' charge assistant.js après clt-common.js', /clt-common\.js\?v=[^"]+"><\/script>\s*<script src="assistant\.js\?v=/.test(lire(p)));
}
verifier('chaque espace dit à l\'assistant qui parle (CLTAssistant.personne)', ['app/livreur.html', 'app/fournisseur.html', 'app/express-client.html', 'app/express-coursier.html', 'app/equipe/09-express-et-temps-reel.js'].every(p => /CLTAssistant\.personne\(currentUser\.id/.test(lire(p))));
const js = lire('app/assistant.js');
verifier('WhatsApp avec le contexte : le rôle, le nom, la question — jamais un numéro de téléphone ni un montant', /Bonjour CLT, je suis ' \+ \(etat\.nom/.test(js) && /Ma question : ' \+ question/.test(js));
verifier('l\'étage 2 ne lit que ce que l\'écran montre (RLS) : express_courses des siens, express_wallets, releve_fournisseur, colis des siens', /from\('express_wallets'\)\.select\('solde'\)\.eq\('coursier_id', moi\)/.test(js) && /from\('releve_fournisseur'\)/.test(js) && /eq\('client_id', moi\)/.test(js) && /eq\('fournisseur_id', moi\)/.test(js));
verifier('Échap ferme la feuille (gérée à la main, pas une couche : voir le commentaire) ; le bouton dit son état (aria-expanded)', !/data-clt-couche/.test(js.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')) && /e\.key === 'Escape' && etat\.ouvert/.test(js) && /aria-expanded/.test(js));
const css = lire('app/style.css');
verifier('l\'icône du rond et de l\'en-tête : la bulle de conversation à trois points (SVG, comme Intercom / Messenger), pas un casque ni un émoji', /var ICONE_BULLE = '<svg[^']*<circle cx="8.5"[^']*<circle cx="15.5"/.test(js) && /b\.innerHTML = ICONE_BULLE;/.test(js) && /clt-assistant__avatar">' \+ ICONE_BULLE/.test(js) && !/🎧/.test(js));
verifier('Équipe : la feuille « Plus » dépliée efface les ronds flottants (l\'assistant cachait « Bureau », 26/09) ; le panneau des notifications s\'arrête au-dessus de la barre du bas (--clt-barre-h)', /body\.clt-feuille-plus-ouverte \.clt-assistant-bouton, body\.clt-feuille-plus-ouverte \.clt-haut\{ visibility:hidden/.test(css) && /clt-feuille-plus-ouverte', !ouvert\)/.test(lire('app/equipe/10-onglets.js')) && /classList\.remove\('clt-feuille-plus-ouverte'\)/.test(lire('app/equipe/10-onglets.js')) && /max-height:calc\(100dvh - var\(--h-topbar, 100px\) - 20px - var\(--clt-barre-h, 0px\)\)/.test(css) && /setProperty\("--clt-barre-h"/.test(lire('app/clt-common.js')));
console.log('\n1 ter. L\'étage 3 : l\'IA qui comprend (26/09)');
const fn = lire('supabase-functions/assistant-repondre/index.ts');
verifier('la fonction serveur : appelant connecté et actif, clé ANTHROPIC_API_KEY en secret (sinon repli), réglage assistant_config, plafond du mois et par personne, journal assistant_echanges', /ANTHROPIC_API_KEY/.test(fn) && /repli: true, pourquoi: "sans_cle"/.test(fn) && /from\("assistant_config"\)/.test(fn) && /plafond_mois/.test(fn) && /plafond_jour/.test(fn) && /from\("assistant_echanges"\)\.insert/.test(fn) && /profil\.status !== "valide"/.test(fn));
verifier('la consigne : français simple, vouvoiement, 2 à 4 phrases, jamais un chiffre inventé, [HUMAIN] et [FICHE:id], pas de puces ni d\'emoji', /vouvoyant, en 2 à 4 phrases/.test(fn) && /n'inventes JAMAIS un chiffre/.test(fn) && /\[HUMAIN\]/.test(fn) && /\[FICHE:identifiant\]/.test(fn) && /ni liste à puces, ni gras, ni emoji/.test(fn));
verifier('la fiche recommandée n\'est acceptée que si elle fait partie des fiches proposées ; les marqueurs sont retirés du texte', /fiches\.some\(\(f\) => f\.id === mFiche\[1\]\)/.test(fn) && /replace\(\/\\\[HUMAIN\\\]\/g, ""\)/.test(fn));
const D = A.decider;
verifier('décider : une règle de l\'étage 2 passe avant l\'IA ; une phrase libre va à l\'IA ; un mot avec une fiche nette reste aux fiches ; un mot sans fiche nette va à l\'IA', D('où est ma course', 'course', []) === 'regle' && D('je dois faire quoi quand le livreur est là', null, [{ score: 9 }]) === 'ia' && D('relevé', null, [{ score: 9 }]) === 'fiches' && D('relevé', null, [{ score: 3 }]) === 'ia' && D('xyz', null, []) === 'ia');
verifier('le navigateur envoie la situation (étage 2, sans balises), les fiches proches et l\'historique, avec le jeton ; 15 s au plus ; repli silencieux', /functions\/v1\/assistant-repondre/.test(js) && /situationDe\(\)/.test(js) && /historique: etat\.historique\.slice\(-6\)/.test(js) && /'Authorization': 'Bearer ' \+ session\.access_token/.test(js) && /15000/.test(js) && /j\.pourquoi === 'sans_cle' \|\| j\.pourquoi === 'inactif'\)\) etat\.ia = false/.test(js));
const sqlIA = path.join(RACINE, '_sql-prive/2026-09-26-l-assistant-qui-comprend.sql');
if (fs.existsSync(sqlIA)) { const q = fs.readFileSync(sqlIA, 'utf8'); verifier('le SQL : assistant_config (une ligne, admin seul écrit), assistant_echanges (chacun lit les siens, le bureau tout ; aucune insertion depuis un compte), assistant_mois(), nettoyage à 90 jours, ok = true', /create table if not exists public\.assistant_config/.test(q) && /check \(id = 1\)/.test(q) && /assistant_config_admin/.test(q) && /assistant_echanges_les_miens/.test(q) && !/assistant_echanges[^\n]*for insert/.test(q) && /function public\.assistant_mois\(\)/.test(q) && /interval '90 days'/.test(q) && /as ok;\s*$/.test(q)); }
verifier('le rond : 56 px, à GAUCHE (le coin droit est celui de « Remonter »), au-dessus de la barre du bas et du bandeau de mise à jour ; cibles ≥ 44 px ; nuit prévue', /\.clt-assistant-bouton\{ position:fixed; left:16px; bottom:calc\(76px \+ env\(safe-area-inset-bottom, 0px\)\)[^}]*width:56px/.test(css) && /\.clt-maj-visible \.clt-assistant-bouton\{/.test(css) && /\.clt-assistant__fiche\{[^}]*min-height:44px/.test(css) && /\.clt-assistant__saisie input\{[^}]*min-height:44px/.test(css) && /html\[data-theme="dark"\] \.clt-assistant__boite\{/.test(css));

console.log('\n' + reussies + ' réussie(s), ' + echouees + ' échouée(s).');
process.exit(echouees ? 1 : 0);
