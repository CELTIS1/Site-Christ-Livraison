/* Banc d'essai de « sortir d'une fenêtre ».
   ------------------------------------------
   À quoi ça sert, en clair. Le 27 août 2026, la demande était celle-ci :

     « Il faut que lorsqu'on veut modifier une carte ou quelque chose, peu importe le compte,
       on ait un bouton retour ou quelque chose pour retourner, même lorsqu'on rentre quelque
       part et qu'on veut ressortir. »

   Ce qui manquait vraiment. Chaque fenêtre savait se fermer, mais chacune dans son coin : six
   endroits différents géraient la touche Échap, et le bouton « retour » du téléphone — le geste
   que tout le monde fait par réflexe — n'était traité nulle part. Avec une fiche ouverte, appuyer
   dessus ne fermait pas la fiche : ça quittait la page, et le travail en cours partait avec.

   Ce que ce fichier vérifie. Pas la forme du code, mais le comportement : on ouvre pour de bon,
   on appuie sur « retour » pour de bon, et on regarde ce qui se passe. Le code testé est le VRAI
   clt-common.js — pas une copie, une copie finirait par diverger en silence. Autour, une page
   simulée minuscule mais fidèle sur les trois points qui comptent : l'affichage réel d'un élément
   dépend de ses classes, l'observateur de mutations se réveille en microtâche, et l'historique
   déclenche « popstate » APRÈS coup, jamais pendant. C'est précisément dans ce décalage que ce
   genre de mécanisme se met à boucler ; s'il n'est pas simulé, le banc d'essai ne prouve rien.

   Lancer à la main :  node tests/sortir-dune-fenetre.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

let reussies = 0, echouees = 0;
function titre(t){ console.log('\n' + t); }
function verifier(quoi, vrai, detail){
  if (vrai) { reussies++; console.log('  ✅ ' + quoi); }
  else { echouees++; console.log('  ❌ ' + quoi); if (detail) console.log('       → ' + detail); }
}

/* ==========================================================================================
   1. Extraction du vrai mécanisme
   ========================================================================================== */
const sourceCommun = fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8');

/* Le mécanisme n'est pas une fonction nommée mais un bloc refermé sur lui-même : on le repère
   par sa bannière, puis on suit les accolades jusqu'à la sienne. Chercher une chaîne de fin
   ferait dépendre le banc d'essai d'un détail d'écriture. */
function blocScelle(source, banniere){
  const b = source.indexOf(banniere);
  if (b === -1) { console.error(`Bannière « ${banniere} » introuvable dans clt-common.js`); process.exit(1); }
  const debut = source.indexOf('(function ()', b);
  if (debut === -1) { console.error('Bloc introuvable après la bannière'); process.exit(1); }
  let i = source.indexOf('{', debut), prof = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') prof++;
    else if (source[i] === '}') { prof--; if (prof === 0) return source.slice(debut, source.indexOf(';', i) + 1); }
  }
  console.error('Fin du bloc introuvable'); process.exit(1);
}
const MECANISME = blocScelle(sourceCommun, 'SORTIR — une seule façon de refermer');

/* ==========================================================================================
   2. Une page simulée, fidèle là où ça compte
   ========================================================================================== */

/* Les mutations d'attributs sont livrées en microtâche, comme dans un navigateur. »popstate«,
   lui, arrive en tâche : c'est un tour de boucle plus tard. Respecter cet ordre est tout
   l'intérêt du banc d'essai — l'inverser masquerait exactement le défaut qu'on veut interdire. */
const enMicrotache = (f) => queueMicrotask(f);
const enTache = (f) => setTimeout(f, 0);
const souffler = () => new Promise(r => setTimeout(r, 1));

let observateurs = [];   // { cible, rappel }

function correspond(el, selecteur){
  if (selecteur.startsWith('[') && selecteur.endsWith(']')) return el.attrs.has(selecteur.slice(1, -1));
  if (selecteur.startsWith('.')) return el.classes.has(selecteur.slice(1));
  return false;
}

class Element {
  constructor(tag, classes = [], attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.nodeType = 1;
    this.classes = new Set(classes);
    this.attrs = new Map(Object.entries(attrs));
    this.enfants = [];
    this.parent = null;
    this.ecouteurs = {};
    this.clics = 0;
    const el = this;
    this.classList = {
      add(...c){ c.forEach(x => el.classes.add(x)); el.mute(); },
      remove(...c){ c.forEach(x => el.classes.delete(x)); el.mute(); },
      contains(c){ return el.classes.has(c); },
    };
  }
  get isConnected(){ let n = this; while (n.parent) n = n.parent; return n === document.body || n === document.documentElement; }
  get firstChild(){ return this.enfants[0] || null; }
  get textContent(){ return this._texte || ''; }
  set textContent(v){ this._texte = v; }
  get className(){ return [...this.classes].join(' '); }
  set className(v){ this.classes = new Set(String(v).split(/\s+/).filter(Boolean)); this.mute(); }
  mute(){ observateurs.filter(o => o.cible === this).forEach(o => enMicrotache(() => o.rappel([{ target: this }]))); }
  setAttribute(n, v){ this.attrs.set(n, String(v)); this.mute(); }
  getAttribute(n){ return this.attrs.has(n) ? this.attrs.get(n) : null; }
  hasAttribute(n){ return this.attrs.has(n); }
  addEventListener(t, f){ (this.ecouteurs[t] ||= []).push(f); }
  click(){ this.clics++; (this.ecouteurs.click || []).forEach(f => f({ target: this })); }
  appendChild(n){ n.parent = this; this.enfants.push(n); if (this === document.body) prevenirCorps(n); return n; }
  insertBefore(n, ref){ n.parent = this; const i = ref ? this.enfants.indexOf(ref) : -1; if (i === -1) this.enfants.push(n); else this.enfants.splice(i, 0, n); return n; }
  tous(){ return this.enfants.flatMap(e => [e, ...e.tous()]); }
  querySelector(sel){ return this.tous().find(e => correspond(e, sel)) || null; }
  querySelectorAll(sel){ const r = this.tous().filter(e => correspond(e, sel)); r.forEach = Array.prototype.forEach.bind(r); return r; }
}

/* La feuille de style, réduite aux deux conventions réellement employées par l'application :
   « hidden » masque (c'est le cas de sept fenêtres sur dix), et une « modal-back » ne s'affiche
   qu'avec « open » (les trois de gestion.html). Le mécanisme ne doit connaître ni l'une ni
   l'autre : il ne regarde que le résultat, c'est-à-dire si la fenêtre est peinte ou non. */
function afficher(el){
  if (el.classes.has('hidden')) return 'none';
  if (el.classes.has('modal-back') && !el.classes.has('open')) return 'none';
  return 'flex';
}

let rappelsCorps = [];
function prevenirCorps(n){ rappelsCorps.forEach(r => enMicrotache(() => r([{ addedNodes: [n] }]))); }

const document = {
  documentElement: null, body: null, readyState: 'complete',
  ecouteurs: {},
  addEventListener(t, f){ (this.ecouteurs[t] ||= []).push(f); },
  querySelectorAll(sel){ return document.body.querySelectorAll(sel); },
  createElement(t){ return new Element(t); },
};
document.documentElement = new Element('html');
document.body = new Element('body');
document.body.parent = document.documentElement;
document.documentElement.enfants.push(document.body);

/* L'historique. Ce qui compte : « popstate » n'est pas synchrone. Un mécanisme qui suppose le
   contraire semble marcher au banc d'essai et boucle sur un vrai téléphone. */
const window_ = {
  ecouteurs: {},
  addEventListener(t, f){ (this.ecouteurs[t] ||= []).push(f); },
  getComputedStyle(el){ return { display: afficher(el), visibility: 'visible' }; },
};
let profondeur = 0;            // entrées posées par le mécanisme
let quitte = false;            // vrai si un « retour » a fait sortir de la page
const history = {
  pushState(){ profondeur++; },
  back(){ this.go(-1); },
  go(n){
    const cible = profondeur + n;
    if (cible < 0) { quitte = true; profondeur = 0; return; }
    profondeur = cible;
    // Comme un vrai navigateur : si un écouteur de « popstate » explose, la page n'est pas
    // détruite pour autant, l'erreur part dans la console et la vie continue. Sans ce filet, le
    // banc d'essai s'arrêterait net au lieu de constater les dégâts — or c'est là qu'ils sont.
    enTache(() => (window_.ecouteurs.popstate || []).forEach(f => {
      try { f({}); } catch (e) { erreursAvalees.push(e.message); }
    }));
  },
};
let erreursAvalees = [];

const bac = vm.createContext({ document, window: window_, history, MutationObserver: class {
  constructor(rappel){ this.rappel = rappel; }
  observe(cible, opts){ if (cible === document.body && opts.childList) rappelsCorps.push(this.rappel); else observateurs.push({ cible, rappel: this.rappel }); }
}, queueMicrotask, setTimeout, Array, console });
bac.window.document = document;
vm.runInContext(MECANISME, bac);

/* ==========================================================================================
   3. Les gestes, rejoués
   ========================================================================================== */

/* Une fenêtre comme il en existe dans l'application : un fond, un panneau, une croix. */
function fabriquerFenetre(nom, { retour = false, modalBack = false } = {}){
  const fond = new Element('div', modalBack ? ['modal-back'] : ['account-modal-overlay', 'hidden'],
    retour ? { 'data-clt-couche': nom, 'data-clt-retour': '.account-modal' } : { 'data-clt-couche': nom });
  const panneau = new Element('div', ['account-modal']);
  const croix = new Element('button', [], { 'data-clt-fermer': '' });
  croix.addEventListener('click', () => fermerAMain(fond));
  panneau.appendChild(croix);
  fond.appendChild(panneau);
  fond.croix = croix; fond.panneau = panneau;
  return fond;
}
const ouvrirAMain = (f) => f.classes.has('modal-back') ? f.classList.add('open') : f.classList.remove('hidden');
const fermerAMain = (f) => f.classes.has('modal-back') ? f.classList.remove('open') : f.classList.add('hidden');
const estPeinte = (f) => afficher(f) !== 'none';
const echap = () => (document.ecouteurs.keydown || []).forEach(f => f({ key: 'Escape' }));
const retourDuTelephone = () => history.go(-1);

const compte = fabriquerFenetre('Mon compte', { retour: true });
const fiche = fabriquerFenetre('Corriger la fiche');
document.body.appendChild(compte);
document.body.appendChild(fiche);
await souffler();

titre('Ce que fait le bouton « retour » du téléphone');

ouvrirAMain(compte);
await souffler();
verifier("ouvrir une fenêtre pose une marche dans l'historique, pour que « retour » ait quelque chose à défaire",
  profondeur === 1, 'profondeur = ' + profondeur);

retourDuTelephone();
await souffler();
verifier("« retour » referme la fenêtre au lieu de quitter la page",
  !estPeinte(compte) && !quitte);
verifier("il la referme en actionnant SON propre bouton, pas en la masquant dans son dos",
  compte.croix.clics === 1, 'clics sur la croix : ' + compte.croix.clics);
verifier("et il ne reste aucune marche en trop dans l'historique",
  profondeur === 0, 'profondeur = ' + profondeur);

titre("Refermer à la main ne laisse pas de marche vide");

ouvrirAMain(compte);
await souffler();
fermerAMain(compte);                       // comme si l'on cliquait la croix
await souffler();
verifier("après une fermeture par l'interface, l'historique est revenu à son point de départ",
  profondeur === 0, 'profondeur = ' + profondeur);
quitte = false;
retourDuTelephone();
await souffler();
verifier("le « retour » suivant sort donc bien de la page, au lieu d'être avalé dans le vide",
  quitte === true);
profondeur = 0; quitte = false;

titre('Deux fenêtres empilées');

ouvrirAMain(compte);
await souffler();
ouvrirAMain(fiche);
await souffler();
verifier("deux fenêtres ouvertes, deux marches",
  profondeur === 2, 'profondeur = ' + profondeur);
retourDuTelephone();
await souffler();
verifier("le premier « retour » ne referme que celle du dessus",
  !estPeinte(fiche) && estPeinte(compte));
retourDuTelephone();
await souffler();
verifier("le second referme celle du dessous",
  !estPeinte(compte) && !quitte);
verifier("et on est revenu à zéro, sans marche orpheline",
  profondeur === 0, 'profondeur = ' + profondeur);
profondeur = 0; quitte = false;

titre('La touche Échap, une seule fois pour toutes');

ouvrirAMain(fiche);
await souffler();
echap();
await souffler();
verifier("Échap referme la fenêtre du dessus, sans que la page ait rien à déclarer",
  !estPeinte(fiche));
verifier("et sans laisser de marche derrière elle",
  profondeur === 0, 'profondeur = ' + profondeur);
echap();
await souffler();
verifier("Échap sans rien d'ouvert ne fait rien du tout",
  profondeur === 0 && !quitte);

titre('Une fenêtre née après le chargement de la page');

const tardive = fabriquerFenetre('Confirmation');
document.body.appendChild(tardive);        // comme cltConfirm(), qui se construit en JavaScript
await souffler();
ouvrirAMain(tardive);
await souffler();
verifier("une fenêtre ajoutée en cours de route est prise en compte sans qu'on l'ait déclarée",
  profondeur === 1, 'profondeur = ' + profondeur);
retourDuTelephone();
await souffler();
verifier("et « retour » la referme comme les autres",
  !estPeinte(tardive) && !quitte);
profondeur = 0; quitte = false;

titre('Le « ← Retour » visible');

verifier("il est posé dans la fenêtre qui l'a demandé",
  !!compte.panneau.querySelector('.clt-retour'));
verifier("il n'est PAS posé dans celle qui ne l'a pas demandé — un « Annuler » suffit là où il y en a un",
  fiche.panneau.querySelector('.clt-retour') === null);
ouvrirAMain(compte); await souffler(); fermerAMain(compte); await souffler();
ouvrirAMain(compte); await souffler();
verifier("rouvrir la fenêtre ne le pose pas une deuxième fois",
  compte.panneau.querySelectorAll('.clt-retour').length === 1,
  'trouvés : ' + compte.panneau.querySelectorAll('.clt-retour').length);
/* S'il manque, on le dit et on continue : un banc d'essai qui s'interrompt à la première absence
   ne montre qu'un seul dégât, alors qu'il y en a peut-être trois à réparer d'un coup. */
const bouton = compte.panneau.querySelector('.clt-retour');
verifier("il dit « ← Retour », pas un signe à deviner",
  !!bouton && bouton.textContent === '← Retour', bouton ? bouton.textContent : 'bouton absent');
if (bouton) bouton.click();
await souffler();
verifier("et il referme vraiment",
  !estPeinte(compte) && profondeur === 0);

titre("Les fenêtres qui se ferment autrement (gestion.html)");

const salarie = fabriquerFenetre('Fiche salarié', { modalBack: true });
document.body.appendChild(salarie);
await souffler();
profondeur = 0; quitte = false;
ouvrirAMain(salarie);                      // ici on AJOUTE « open » au lieu de retirer « hidden »
await souffler();
verifier("une fenêtre qui s'ouvre par une autre convention est vue quand même",
  profondeur === 1, 'profondeur = ' + profondeur);
retourDuTelephone();
await souffler();
verifier("et « retour » la referme aussi",
  !estPeinte(salarie) && !quitte && profondeur === 0);

titre("Quand la fermeture, elle, tombe en panne");

/* Pourquoi ce cas mérite un contrôle à lui seul. Fermer une fenêtre, c'est exécuter le code de la
   page — du code qu'on n'a pas écrit ici et qui peut échouer. Ce qui compte alors n'est pas que la
   fenêtre se ferme (elle ne le peut pas), c'est que le mécanisme ne garde pas le souvenir d'une
   couche qu'il croit encore ouverte. Sinon chaque « retour » suivant s'acharnerait sur cette
   fenêtre fantôme, et on ne pourrait plus jamais quitter la page : le piège exact que la demande
   de départ voulait supprimer, réinstallé à l'autre bout. C'est le seul cas où l'ordre des deux
   lignes du gestionnaire de « popstate » se voit — mesuré, tous les autres sont indifférents. */
profondeur = 0; quitte = false;
const enPanne = new Element('div', ['account-modal-overlay', 'hidden'], {});
document.body.appendChild(enPanne);
await souffler();
window_.cltEnregistrerCouche(enPanne, { nom: 'Fenêtre en panne', fermer: function () { throw new Error('la fermeture a échoué'); } });
ouvrirAMain(enPanne);
await souffler();
verifier("la fenêtre est bien suivie avant la panne",
  profondeur === 1 && window_.cltCouchesOuvertes().includes('Fenêtre en panne'),
  'profondeur = ' + profondeur + ', ouvertes = ' + window_.cltCouchesOuvertes().join(','));
retourDuTelephone();
await souffler();
verifier("la fermeture a bien échoué, c'est le cas qu'on met à l'épreuve",
  erreursAvalees.length === 1, 'erreurs relevées : ' + erreursAvalees.length);
verifier("le mécanisme ne garde pas le souvenir d'une fenêtre qu'il n'a pas su fermer",
  window_.cltCouchesOuvertes().length === 0, 'encore ouvertes : ' + window_.cltCouchesOuvertes().join(','));
retourDuTelephone();
await souffler();
verifier("on peut donc toujours quitter la page, au lieu d'y rester enfermé",
  quitte === true);

/* On range la page avant la suite, et ce rangement dit quelque chose de vrai. Tant que cette
   fenêtre reste peinte, le mécanisme la réclame de nouveau chaque fois qu'autre chose le réveille :
   il repose une marche pour elle. C'est voulu — on ne s'échappe pas d'un écran qui est toujours
   là — mais si on la laissait ouverte ici, tous les blocs suivants compteraient une marche de plus
   et on mettrait sur le dos des onglets un chiffre qui vient d'ailleurs. On la referme donc pour
   de bon, et on vérifie que la page est réellement redevenue calme avant de continuer. */
fermerAMain(enPanne);
await souffler();
profondeur = 0; quitte = false;
ouvrirAMain(fiche); await souffler(); fermerAMain(fiche); await souffler();
verifier("la page est repartie sur un compte juste : une ouverture, une fermeture, rien en trop",
  profondeur === 0 && !quitte && window_.cltCouchesOuvertes().length === 0,
  'profondeur = ' + profondeur + ', ouvertes = ' + window_.cltCouchesOuvertes().join(','));

titre("Le « retour » et les onglets");

/* Ce que ça reproduit, et pourquoi c'est le même geste que ci-dessus. Le 28 août 2026, mesure
   faite sur l'écran du livreur en production : passer de « Mes colis » à « Finance » ne touchait
   pas à l'historique — history.length valait 5 avant, 5 après un changement, 5 après deux. Le
   « retour » du téléphone ne ramenait donc pas à l'onglet précédent : il quittait l'application.
   Cinq écrans étaient dans ce cas — Livreur, Équipe, Fournisseur, Express client et Express
   coursier — et aucun des huit fichiers de app/ n'appelait history.pushState.

   Pourquoi ça vit ici et pas ailleurs. Les fenêtres empilent déjà leurs propres marches dans
   l'historique et comptent les retours qu'elles se demandent à elles-mêmes. Un second empileur
   posé à côté désynchroniserait ce compte. C'est donc le MÊME mécanisme qui doit tenir les deux,
   et c'est ce banc-là qui doit le prouver.

   Ce qu'on rejoue : de vrais boutons d'onglet, avec le comportement qu'ont les pages réelles —
   un clic déplace la classe « active » d'un bouton à l'autre, rien de plus. */

profondeur = 0; quitte = false;

function fabriquerOnglets(attribut, noms){
  const boutons = noms.map(nom => new Element('button', ['clt-toptab'], { [attribut]: nom }));
  boutons.forEach(b => b.addEventListener('click', () => {
    boutons.forEach(x => { if (x === b) x.classList.add('active'); else x.classList.remove('active'); });
  }));
  boutons[0].classes.add('active');            // état de départ, sans réveiller personne
  boutons.forEach(b => document.body.appendChild(b));
  return boutons;
}
function ongletAffiche(boutons){
  const actif = boutons.find(b => b.classes.has('active'));
  if (!actif) return null;
  return actif.getAttribute('data-clttab') || actif.getAttribute('data-eqtab');
}

const onglets = fabriquerOnglets('data-clttab', ['mes', 'recup', 'finance']);
await souffler();
verifier("l'onglet de départ ne pose aucune marche : on n'est allé nulle part",
  profondeur === 0, 'profondeur = ' + profondeur);

onglets[2].click();                            // « Finance »
await souffler();
verifier("changer d'onglet pose une marche, pour que « retour » ait de quoi revenir",
  profondeur === 1, 'profondeur = ' + profondeur);

retourDuTelephone();
await souffler();
verifier("« retour » ramène à l'onglet précédent au lieu de quitter l'application",
  ongletAffiche(onglets) === 'mes' && !quitte,
  'onglet affiché : ' + ongletAffiche(onglets) + ', quitté : ' + quitte);
verifier("il y revient en actionnant le bouton de la page, pas en bricolant son affichage",
  onglets[0].clics === 1, 'clics sur « Mes colis » : ' + onglets[0].clics);
verifier("et il ne laisse aucune marche en trop derrière lui",
  profondeur === 0, 'profondeur = ' + profondeur);

titre("Depuis le premier onglet, « retour » quitte bien l'application");

quitte = false;
retourDuTelephone();
await souffler();
verifier("revenu au point de départ, le retour suivant sort de la page : on n'est pas enfermé dedans",
  quitte === true);
profondeur = 0; quitte = false;

titre("Trois onglets parcourus se remontent un par un, dans l'ordre");

onglets[1].click(); await souffler();          // Récup.
onglets[2].click(); await souffler();          // Finance
verifier("deux changements, deux marches",
  profondeur === 2, 'profondeur = ' + profondeur);
retourDuTelephone(); await souffler();
verifier("le premier « retour » revient sur Récup.",
  ongletAffiche(onglets) === 'recup', 'onglet affiché : ' + ongletAffiche(onglets));
retourDuTelephone(); await souffler();
verifier("le second revient sur Mes colis",
  ongletAffiche(onglets) === 'mes', 'onglet affiché : ' + ongletAffiche(onglets));
verifier("et l'historique est revenu exactement à zéro",
  profondeur === 0 && !quitte, 'profondeur = ' + profondeur);

titre("Une fenêtre ouverte passe avant les onglets");

/* L'ordre compte : la fenêtre est ouverte APRÈS le changement d'onglet, sa marche est donc
   au-dessus. Un « retour » doit refermer la fenêtre et laisser l'onglet tranquille, sans quoi
   on reculerait de deux pas d'un coup — et on perdrait le travail en cours dans la fenêtre. */
profondeur = 0; quitte = false;
onglets[2].click(); await souffler();          // Finance : une marche
ouvrirAMain(fiche); await souffler();          // la fenêtre : une seconde marche
verifier("un onglet changé puis une fenêtre ouverte font deux marches distinctes",
  profondeur === 2, 'profondeur = ' + profondeur);
retourDuTelephone(); await souffler();
verifier("le « retour » referme la fenêtre",
  !estPeinte(fiche));
verifier("et ne touche pas à l'onglet, qui est resté sur Finance",
  ongletAffiche(onglets) === 'finance', 'onglet affiché : ' + ongletAffiche(onglets));
retourDuTelephone(); await souffler();
verifier("le « retour » d'après, lui, revient sur l'onglet précédent",
  ongletAffiche(onglets) === 'mes' && !quitte, 'onglet affiché : ' + ongletAffiche(onglets));
profondeur = 0; quitte = false;

titre("L'écran de l'équipe nomme ses onglets autrement, et c'est pareil");

/* equipe.html écrit data-eqtab là où les autres écrivent data-clttab. Le mécanisme doit
   connaître les deux, sinon le seul écran où l'on passe la journée resterait sans retour. */
const ongletsEquipe = fabriquerOnglets('data-eqtab', ['colis', 'finances', 'comptes']);
await souffler();
ongletsEquipe[1].click(); await souffler();
verifier("data-eqtab est reconnu au même titre que data-clttab",
  profondeur === 1, 'profondeur = ' + profondeur);
retourDuTelephone(); await souffler();
verifier("et le retour y ramène aussi à l'onglet précédent",
  ongletAffiche(ongletsEquipe) === 'colis' && !quitte, 'onglet affiché : ' + ongletAffiche(ongletsEquipe));
profondeur = 0; quitte = false;

titre("Quand le bouton d'onglet, lui, tombe en panne à mi-chemin");

/* Pourquoi ce cas mérite son contrôle. Revenir à un onglet, c'est cliquer le bouton de la page,
   donc exécuter du code qu'on n'a pas écrit ici : il change l'onglet, puis recharge une liste, et
   ce rechargement peut échouer. L'onglet a alors bel et bien changé, mais le clic s'est arrêté en
   route. C'est le seul moment où l'ordre des deux lignes de allerAOnglet() se voit — mesuré : dans
   tous les cas ordinaires, noter l'onglet visé avant ou après le clic donne exactement le même
   résultat, parce que l'observateur se réveille en microtâche, toujours après nous. Ici, non. Si
   on notait après, la ligne ne s'exécuterait jamais ; l'observateur trouverait un onglet qu'il ne
   s'attendait pas à voir et poserait une marche pour un pas que personne n'a fait. Le compte de
   l'historique se décalerait d'un cran, et il faudrait deux « retour » pour un seul geste. */
const erreursAvant = erreursAvalees.length;
onglets[0].addEventListener('click', () => { throw new Error('le rechargement de la liste a échoué'); });
onglets[2].click(); await souffler();          // Finance : une marche
retourDuTelephone(); await souffler();
verifier("le clic a bien échoué après avoir changé l'onglet, c'est le cas qu'on met à l'épreuve",
  erreursAvalees.length === erreursAvant + 1, 'erreurs relevées : ' + (erreursAvalees.length - erreursAvant));
verifier("l'onglet a quand même changé, puisque la page l'avait fait avant d'échouer",
  ongletAffiche(onglets) === 'mes', 'onglet affiché : ' + ongletAffiche(onglets));
verifier("et aucune marche fantôme n'est posée pour un pas que personne n'a fait",
  profondeur === 0, 'profondeur = ' + profondeur);
retourDuTelephone(); await souffler();
verifier("on peut donc toujours quitter la page, au lieu d'y rester enfermé",
  quitte === true);
profondeur = 0; quitte = false;

/* ==========================================================================================
   4. Le contrat, page par page
   ==========================================================================================
   Le mécanisme ne peut rien pour une fenêtre qui ne se déclare pas. Ces vérifications-là sont
   la seule chose qui empêchera, dans six mois, qu'une nouvelle fenêtre naisse muette. */
titre('Chaque fenêtre en plein écran se déclare');

const PAGES = ['equipe.html', 'gestion.html', 'livreur.html', 'fournisseur.html',
               'login.html', 'express-client.html', 'express-coursier.html', 'express-login.html'];
const CLASSES_DE_FOND = ['account-modal-overlay', 'confirm-modal-overlay', 'pwd-modal-overlay',
                         'fiche-ecran-overlay', 'modal-back'];

const muettes = [], sansSortie = [];
for (const page of PAGES) {
  const lignes = fs.readFileSync(path.join(APP, page), 'utf8').split('\n');
  const fonds = [];
  lignes.forEach((l, i) => {
    if (!/^\s*<div /.test(l)) return;
    const cls = /class="([^"]*)"/.exec(l);
    if (cls && CLASSES_DE_FOND.some(c => cls[1].split(/\s+/).includes(c))) fonds.push({ i, l });
  });
  fonds.forEach((f, n) => {
    const nom = (/id="([^"]*)"/.exec(f.l) || [, 'ligne ' + (f.i + 1)])[1];
    if (!/data-clt-couche=/.test(f.l)) { muettes.push(page + ' → ' + nom); return; }
    // Jusqu'au fond suivant, ou 250 lignes : aucune de ces fenêtres n'est plus longue.
    const fin = fonds[n + 1] ? fonds[n + 1].i : Math.min(f.i + 250, lignes.length);
    if (!/data-clt-fermer/.test(lignes.slice(f.i, fin).join('\n'))) sansSortie.push(page + ' → ' + nom);
  });
}
verifier("aucune fenêtre en plein écran n'est restée muette (data-clt-couche)",
  muettes.length === 0, muettes.join(', '));
verifier("chacune désigne le bouton qui la referme (data-clt-fermer)",
  sansSortie.length === 0, sansSortie.join(', '));

/* Le pendant côté feuille de style : sans cette classe, le bouton posé serait un bouton nu. */
const styles = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
const regle = /\.clt-retour\s*\{([^}]*)\}/.exec(styles);
verifier("la feuille de style habille le « ← Retour »", !!regle);
verifier("et lui donne la hauteur d'un pouce, pour qu'on le vise sans regarder",
  !!regle && /min-height:\s*44px/.test(regle[1]),
  regle ? regle[1].trim() : 'règle absente');

/* ========================================================================================== */
console.log(`\n${reussies} vérification(s) réussie(s), ${echouees} échec(s).`);
process.exit(echouees === 0 ? 0 : 1);
