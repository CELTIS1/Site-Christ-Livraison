/* L'ASSISTANT DU SITE ET LA VENDEUSE DE LA SEMAINE — chantier Q, lot S-5 (26 septembre 2026)
   ==========================================================================================
   Les visiteurs (sans compte) ont le même rond 💬 sur l'accueil, Vendeuses, Livreurs, Express :
   réponses écrites (prix, zones, comment ça marche, livreur, Express, suivi…), un lien vers la
   bonne page, WhatsApp toujours ; pas d'IA pour les visiteurs. L'accueil montre la vendeuse de
   la semaine (site_vendeuses, une par semaine ISO, la même pour tout le monde).
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
const ctx = vm.createContext({ window: {}, location: { pathname: '/index.html' } });
vm.runInContext(lire('site-assistant.js'), ctx);
const S = ctx.window.CLTSiteAssistant;

console.log('\n1. Les réponses du site');
const r = (q) => (S.repondre(q) || {}).id || null;
verifier('prix : « combien ça coûte ? », « c\'est cher ? », « vos tarifs »', r('combien ça coûte ?') === 'prix' && r("c'est cher ?") === 'prix' && r('vos tarifs') === 'prix');
verifier('zones : « vous livrez à Bingerville ? », « quelles communes »', r('vous livrez à Bingerville ?') === 'zones' && r('quelles communes') === 'zones');
verifier('livreur : « je veux devenir livreur avec ma moto », « vous recrutez ? », « quel salaire »', r('je veux devenir livreur avec ma moto') === 'livreur' && r('vous recrutez ?') === 'livreur' && r('quel salaire') === 'livreur');
verifier('express : « une course urgente maintenant », « c\'est quoi express »', r('une course urgente maintenant') === 'express' && r("c'est quoi express") === 'express');
verifier('vendeuse : « je vends des pagnes, comment je suis payée », « le reversement »', r('je vends des pagnes, comment je suis payée') === 'vendeuse' && r('le reversement') === 'vendeuse');
verifier('suivi : « où est mon colis », « numéro de suivi »', r('où est mon colis') === 'suivi' && r('numéro de suivi') === 'suivi');
verifier('perdu / réclamation → humain proposé ; contact → humain', S.repondre('mon colis est perdu').humain === true && S.repondre('je veux parler à quelqu\'un').humain === true);
verifier('rien de connu → null (le navigateur propose WhatsApp avec la question)', r('blabla zzz') === null && /Ma question : blabla/.test(decodeURIComponent(S.lienWhatsApp('blabla'))));
verifier('chaque réponse a un texte, un lien vers une page du site et un libellé ; mots entiers (« ou » ne prend pas « bonjour »)', S.REPONSES.every((x) => x.texte && /\.html/.test(x.lien) && x.libelle) && r('bonjour') === null);
verifier('trois questions proposées par page (accueil, vendeuses, livreurs, express)', ['index', 'vendeuses', 'livreurs', 'express'].every((k) => (S.SUGGESTIONS[k] || []).length === 3));

console.log('\n2. Le branchement');
const index = lire('index.html');
verifier('le script est sur les quatre pages publiques, en différé', ['index.html', 'vendeuses.html', 'livreurs.html', 'express.html'].every((f) => /<script src="site-assistant\.js" defer><\/script>/.test(lire(f))));
verifier('le rond : 56 px, en bas à GAUCHE (WhatsApp est à droite), au-dessus de la barre « Demander un devis » sur téléphone ; cibles ≥ 44 px', /\.cs-bouton\{position:fixed;left:16px;[^}]*width:56px;height:56px/.test(lire('site-assistant.js')) && /@media\(max-width:680px\)\{\.cs-bouton\{bottom:calc\(84px/.test(lire('site-assistant.js')) && /\.cs-saisie input\{[^}]*min-height:44px/.test(lire('site-assistant.js')) && /\.cs-lien\{[^}]*min-height:44px/.test(lire('site-assistant.js')));
verifier('aucun appel réseau, aucune donnée personnelle : pas de fetch ni de supabase dans le script du site', !/fetch\(|supabase|localStorage/.test(lire('site-assistant.js')));

console.log('\n3. La vendeuse de la semaine (accueil)');
verifier('la section existe, cachée par défaut, entre la preuve et la confiance ; « Commander chez elle » compté, lien vers toutes les vendeuses', /<section class="semaine" id="vendeuse-semaine" hidden/.test(index) && index.indexOf('id="vendeuse-semaine"') > index.indexOf('id="preuve"') && index.indexOf('id="vendeuse-semaine"') < index.indexOf('class="trust"') && /id="vs-wa"[^>]*data-site-compteur="vendeuse-semaine"/.test(index) && /href="vendeuses\.html#nos-vendeuses"/.test(index));
verifier('elle lit site_vendeuses (consenties ET validées), une fiche par semaine ISO, rien d\'affiché sans fiche', /rpc\/site_vendeuses/.test(index) && /function semaineISO/.test(index) && /if \(!v \|\| !v\.nom\) return;/.test(index) && /pas de fiche, pas de section/.test(index));
const m = index.match(/function semaineISO[\s\S]*?window\.__cltChoisirVendeuse = choisir;/);
const c2 = vm.createContext({ window: {} }); vm.runInContext(m[0], c2);
const choisir = c2.window.__cltChoisirVendeuse;
verifier('la même vendeuse toute la semaine (lundi 28/09 = samedi 26/09 ? non : semaines ISO 39 et 40), et elle change la semaine suivante', choisir([{ n: 'A' }, { n: 'B' }], new Date('2026-09-29')).n === choisir([{ n: 'A' }, { n: 'B' }], new Date('2026-10-03')).n && choisir([{ n: 'A' }, { n: 'B' }], new Date('2026-09-29')).n !== choisir([{ n: 'A' }, { n: 'B' }], new Date('2026-10-06')).n && choisir([], new Date()) === null);

console.log('\n' + reussies + ' réussie(s), ' + echouees + ' échouée(s).');
process.exit(echouees ? 1 : 0);
