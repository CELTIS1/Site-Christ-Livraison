/* INSTALLER CLT SANS ATTENDRE LE PLAY STORE — point 6.2, 17 septembre 2026
   ==========================================================================================
   L'application est une PWA depuis le début : chaque espace a son manifeste, son icône et son
   service worker, et tout navigateur moderne sait la poser sur l'écran d'accueil. Personne ne
   le savait, parce que rien ne le proposait nulle part. Or le compte Play d'entreprise dépend
   d'un numéro D-U-N-S qui peut prendre trente jours : l'équipe, les livreurs et les clientes
   n'ont pas à attendre ce délai pour avoir l'icône sur leur téléphone.

   Trois choses à ne pas perdre :
     1. L'offre du navigateur (beforeinstallprompt) est émise UNE fois. Si personne ne l'attrape
        et n'appelle preventDefault, elle est perdue et le bouton ne s'allumera jamais.
     2. Le bouton doit disparaître une fois l'application installée — un bouton qui ne sert plus
        est pire qu'une absence de bouton.
     3. L'iPhone n'émet aucune offre : là, le seul chemin est « Partager » → « Sur l'écran
        d'accueil », donc la page de marche à suivre doit exister et être atteignable.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const commun = lire('app/clt-common.js');
const page = lire('installer.html');
const sw = lire('sw.js');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 300) : '')); }
}

console.log('\n1. L\'offre du navigateur est attrapée, et pas perdue');
verifier('clt-common.js écoute beforeinstallprompt', /addEventListener\('beforeinstallprompt'/.test(commun));
verifier('il appelle preventDefault (sinon Chrome affiche sa barre à lui, hors de notre écran)', /beforeinstallprompt'[\s\S]{0,120}preventDefault\(\)/.test(commun));
verifier('la page « Installer » la met de côté dès le <head>, avant tout le reste', /__cltOffreInstallTot/.test(page) && page.indexOf('__cltOffreInstallTot') < page.indexOf('</head>'));
verifier('clt-common.js reprend cette offre précoce', /window\.__cltOffreInstallTot/.test(commun));
verifier('l\'offre est oubliée après usage : le navigateur ne la rend qu\'une fois', /CLT_OFFRE_INSTALL = null;[\s\S]{0,80}offre\.prompt\(\)/.test(commun));

console.log('\n2. Le bouton n\'apparaît que quand il sert');
verifier('on sait reconnaître une application déjà installée (display-mode, navigator.standalone)', /display-mode: standalone/.test(commun) && /navigator\.standalone/.test(commun));
verifier('on reconnaît l\'iPhone, iPadOS compris (qui se présente comme un Mac)', /iPad\|iPhone\|iPod/.test(commun) && /maxTouchPoints/.test(commun));
/* 19/09/2026 — Celtis : « quand ils cliquent, ils puissent voir le bouton, chez les livreurs, les
   clientes et partout ». L'ancienne règle (offre du navigateur OU iPhone) laissait Firefox et
   Safari d'ordinateur sans bouton, et perdait l'offre de Chrome quand elle arrivait avant
   clt-common.js. Désormais : visible dès que ce n'est pas installé. */
verifier('proposer = pas déjà installée, point — sur tous les navigateurs', /function cltPeutProposerInstall\(\) \{\s*return !cltDejaInstallee\(\);/.test(commun));
verifier('sans offre du navigateur, l\'appui ouvre la marche à suivre au lieu de ne rien faire', /window\.open\('\/installer\.html'/.test(commun));
const ESPACES = ['livreur','fournisseur','equipe','gestion','express-client','express-coursier','login','express-login'];
ESPACES.forEach(f => {
  const h = lire('app/' + f + '.html');
  const tete = h.slice(0, h.indexOf('</head>'));
  verifier(`${f}.html garde l'offre dès le <head>, avant theme.js et tout le reste`,
    /__cltOffreInstallTot\s*=\s*e/.test(tete) && tete.indexOf('__cltOffreInstallTot') < tete.indexOf('theme.js'));
});
verifier('l\'installation faite, le bouton s\'efface (appinstalled)', /addEventListener\('appinstalled'/.test(commun) && /cltMajBoutonInstall\(\)/.test(commun));

console.log('\n3. Une entrée dans le menu de chaque espace, sans toucher aux pages');
verifier('le bouton est créé et rangé dans le groupe « Outils »', /btn-installer-app/.test(commun) && /Outils/i.test(commun));
verifier('si la page a déjà son bouton (page de connexion), on se contente de le brancher', /const dejaLa = document\.getElementById\('btn-installer-app'\)/.test(commun));
verifier('la page de connexion porte l\'encadré, avec son explication', /bloc-installer/.test(lire('app/login.html')) && /écran d'accueil/.test(lire('app/login.html')));
verifier('cet encadré disparaît entier une fois installée, pas seulement son bouton', /bloc-installer'\);[\s\S]{0,80}toggle\('hidden', !montrer\)/.test(commun));
// Les six espaces partagent la même structure de menu : c'est ce qui rend l'injection possible.
['app/equipe.html', 'app/livreur.html', 'app/fournisseur.html', 'app/express-client.html', 'app/express-coursier.html'].forEach((f) => {
  verifier(`${f.split('/').pop()} a bien un menu ☰ où poser l'entrée`, /id="settings-dropdown"/.test(lire(f)));
});

console.log('\n4. La marche à suivre');
verifier('la page /installer.html existe', page.length > 1000);
verifier('les trois chemins sont écrits : Android, iPhone, ordinateur', /pas-android/.test(page) && /pas-iphone/.test(page) && /pas-ordi/.test(page));
verifier('elle dit qu\'il faut Safari sur iPhone (Chrome n\'y sait pas poser d\'icône)', /Safari/.test(page) && /Chrome ne sait pas poser/.test(page));
verifier('les étapes sont illustrées (quatre dessins, pas des captures de marque)', (page.match(/<svg/g) || []).length === 4);
verifier('un bouton caché ne laisse pas de trou (le style le prévoit)', /\.bouton\[hidden\]\{display:none;\}/.test(page));
verifier('les deux lignes du service à la clientèle sont là pour dépanner', /0779604761/.test(page) && /0170407312/.test(page));
verifier('elle est atteignable depuis le site (menu et pied de page)', (lire('index.html').match(/installer\.html/g) || []).length >= 2);
verifier('elle s\'affiche hors réseau : le service worker la pré-charge', /'\/installer\.html'/.test(sw));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
