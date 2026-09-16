/* UNE SEULE COPIE — 16 septembre 2026 (feuille de route 3.6, et 3.5 étendu à tous les espaces)
   ==========================================================================================
   Six copies du bloc des notifications, deux escapeHTML, deux avatarHTML de signatures
   différentes : autant d'endroits où une correction s'oublie. Ce banc garde :
     1. LES NOTIFICATIONS VIVENT DANS clt-common.js, une fois ; chaque page appelle
        cltInitPushButton avec l'identifiant de son utilisateur ; la clé VAPID n'est écrite qu'une fois.
     2. escapeHTML N'EXISTE QU'UNE FOIS (clt-common.js) ; gestion.js n'a plus d'avatarHTML qui
        masque celui de config.js.
     3. PLUS AUCUN alert() NATIF dans l'application, sauf les deux de gestion.js qui précèdent une
        redirection (un bandeau disparaîtrait avec la page) — et ils le disent.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireAvecCode } from './_lire-page.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const lire = (f) => lireAvecCode(APP, f);
const PAGES = ['equipe.html', 'livreur.html', 'fournisseur.html', 'express-client.html', 'express-coursier.html'];
const SCRIPTS = ['gestion.js', 'config.js', 'clt-common.js', 'clients-dashboard.js', 'livreurs-dashboard.js'];

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
const commun = lire('clt-common.js');

console.log('\n1. Les notifications, une seule copie');
verifier('clt-common.js porte le bloc (clé, abonnement, activation, bouton)', /const CLT_VAPID_PUBLIC_KEY = '/.test(commun) && /async function cltEnregistrerAbonnementPush\(subscription, role, userId\)/.test(commun) && /async function cltActiverPush\(role, userId\)/.test(commun) && /async function cltInitPushButton\(role, lireUserId\)/.test(commun));
const copies = [...PAGES, ...SCRIPTS.filter(s => s !== 'clt-common.js')].filter(f => /VAPID_PUBLIC_KEY|function urlBase64ToUint8Array|async function activerPush|async function initPushButton/.test(lire(f)));
verifier('aucune page ne garde sa propre copie', copies.length === 0, copies.join(', '));
const appels = PAGES.map(f => [f, /cltInitPushButton\(profile\.role, \(\) => currentUser \? currentUser\.id : null\)/.test(lire(f))]);
verifier('les cinq pages appellent le bloc partagé avec leur utilisateur', appels.every(([, ok]) => ok), appels.filter(([, ok]) => !ok).map(([f]) => f).join(', '));
verifier('gestion.js aussi, avec PUSH_USER', /cltInitPushButton\(profile\.role, \(\) => PUSH_USER \? PUSH_USER\.id : null\)/.test(lire('gestion.js')));
verifier('les messages du bloc sont des bandeaux typés (info, avertissement, erreur, succès)', /cltToast\("Votre navigateur ne prend pas en charge[^"]*", \{ type: 'info', duration: 9000 \}\)/.test(commun) && /cltToast\("Notifications refusées[^"]*", \{ type: 'warning' \}\)/.test(commun) && /cltToast\("Impossible d'enregistrer l'abonnement[^"]*", \{ type: 'error' \}\)/.test(commun) && /cltToast\("Notifications activées[^"]*", \{ type: 'success' \}\)/.test(commun));

console.log('\n2. escapeHTML et avatarHTML');
const defsEscape = [...PAGES, ...SCRIPTS].filter(f => /^function escapeHTML\(/m.test(lire(f)));
verifier('escapeHTML n\'est défini que dans clt-common.js', defsEscape.length === 1 && defsEscape[0] === 'clt-common.js', defsEscape.join(', '));
verifier('gestion.js n\'a plus d\'avatarHTML (il masquait celui de config.js) mais avatarSalarieHTML', !/function avatarHTML\(/.test(lire('gestion.js')) && /function avatarSalarieHTML\(s\)/.test(lire('gestion.js')) && /\$\{avatarSalarieHTML\(s\)\}/.test(lire('gestion.js')) && /^function avatarHTML\(profile, size\)/m.test(lire('config.js')));

console.log('\n3. Plus aucun alert() natif, sauf deux justifiés');
const natifs = [];
[...PAGES, ...SCRIPTS].forEach(f => {
  lire(f).split('\n').forEach((l, i) => {
    if (/\balert\(/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l) && !/window\.alert/.test(l) && !/alert\(\) natifs/.test(l)) natifs.push(f + ':' + (i + 1));
  });
});
verifier('il ne reste que les deux alert() de gestion.js, avant redirection, et ils sont annotés', natifs.length === 2 && natifs.every(x => x.startsWith('gestion.js:')) && (lire('gestion.js').match(/alert\(\) natif gardé volontairement/g) || []).length === 2, natifs.join(', '));
verifier('plus aucun repli « else alert(...) » derrière un cltToast', ![...PAGES, ...SCRIPTS].some(f => /else alert\(/.test(lire(f))));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
