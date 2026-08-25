/* Banc d'essai de « l'écran ne bouge pas tout seul ».
   ---------------------------------------------------
   À quoi ça sert, en clair. Le 25 août 2026, la plainte était celle-ci :

     « Ça continue de s'actualiser, s'actualiser ; quand ça s'actualise, ça vibre, et les données
       qui sont saisies s'effacent. Et puis lorsqu'on clique sur les listes déroulantes, qu'on
       scrolle par là en bas, ça bloque, ça n'arrive pas à défiler. »

   Trois plaintes, une seule cause. Toutes les 25 secondes — et à chaque geste d'un collègue
   n'importe où sur le terrain, puisque le temps réel écoute toute la table des colis — les écrans
   se redessinaient d'un bloc. Or neuf fois sur dix, ce qui était recalculé était RIGOUREUSEMENT
   IDENTIQUE à ce qui était déjà à l'écran. On détruisait donc la page pour la remplacer par
   elle-même, plusieurs fois par minute. Le navigateur, lui, ne peut pas le deviner : il jette les
   nœuds et en refabrique, et il perd au passage la position de défilement, le choix fait dans une
   liste, le curseur, et ce qui était en train d'être tapé.

   La règle posée ce jour-là tient en une phrase : on compare avant d'écrire. Ce fichier vérifie
   que la règle est vraie dans le code, et qu'elle le reste.

   Comment : on charge le VRAI code de clt-common.js (pas une copie — une copie finirait par
   diverger en silence) et on l'exécute sur une page simulée. Puis on relit les écrans pour
   s'assurer qu'aucun ne s'est remis à écrire sans comparer.

   Lancer à la main :  node tests/ecran-qui-ne-bouge-pas.test.mjs
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

/* ---------- Extraction du vrai code ---------- */
const sourceCommun = fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8');
function bloc(source, nom, fichier){
  const debut = source.search(new RegExp('function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans ${fichier}`); process.exit(1); }
  let i = source.indexOf('{', debut), prof = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') prof++;
    else if (source[i] === '}') { prof--; if (prof === 0) return source.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable dans ${fichier}`); process.exit(1);
}

/* Une page simulée, réduite au strict nécessaire : un élément sait combien de fois son contenu a
   été RÉELLEMENT réécrit. C'est ce compteur qui dit si l'écran a bougé ou non. */
function faireElement(){
  const el = {
    _html: '', _value: '', reecritures: 0, options: [],
    get childNodes(){ return this._html === '' ? [] : [{}]; },
    get innerHTML(){ return this._html; },
    set innerHTML(v){
      this._html = v;
      this.reecritures++;
      // Imitation d'un <select> : on relit les valeurs des <option>. Remplacer les options remet
      // le choix sur la première — exactement ce que fait un navigateur, et exactement ce qui
      // faisait disparaître la cliente choisie avant le 25/08/2026.
      const vals = [...String(v).matchAll(/<option value="([^"]*)"/g)].map(m => m[1]);
      this.options = vals.map(x => ({ value: x }));
      if (vals.length) this._value = vals[0];
    },
    get value(){ return this._value; },
    set value(v){
      // Point capital, et facile à rater si l'on écrit une imitation trop complaisante : dans un
      // navigateur, affecter à un <select> une valeur qui ne correspond à AUCUNE option ne
      // provoque pas d'erreur — elle est simplement ignorée, et la valeur devient vide. C'est ce
      // qui permet à cltPoserOptions de détecter qu'un choix n'existe plus.
      if (!this.options.length) { this._value = v; return; }
      this._value = this.options.some(o => o.value === v) ? v : '';
    },
  };
  return el;
}

// La mémoire des derniers HTML posés fait partie du mécanisme : on la reprend telle quelle
// depuis le fichier plutôt que d'en fabriquer une ici, pour ne pas tester autre chose.
const memoire = sourceCommun.match(/const\s+__cltDernierHTML\s*=\s*new WeakMap\(\);/);
if (!memoire) { console.error('__cltDernierHTML introuvable dans clt-common.js'); process.exit(1); }

const contexte = vm.createContext({ console, WeakMap });
vm.runInContext([
  memoire[0],
  bloc(sourceCommun, 'cltPoserHTML', 'clt-common.js'),
  bloc(sourceCommun, 'cltPoserOptions', 'clt-common.js'),
  'globalThis.cltPoserHTML = cltPoserHTML; globalThis.cltPoserOptions = cltPoserOptions;',
].join('\n\n'), contexte);
const { cltPoserHTML, cltPoserOptions } = contexte;

/* ---------- 1. Une mise à jour identique ne redessine rien ---------- */
titre('Une mise à jour identique ne redessine rien');
{
  const liste = faireElement();
  const html = '<div class="colis">Colis 1</div><div class="colis">Colis 2</div>';
  const premier = cltPoserHTML(liste, html);
  verifier('le premier affichage écrit bien à l\'écran', premier === true && liste.reecritures === 1);

  // 24 rafraîchissements de plus, soit dix minutes de veille sans qu'aucun colis ne change.
  let redessins = 0;
  for (let i = 0; i < 24; i++) if (cltPoserHTML(liste, html)) redessins++;
  verifier('dix minutes de rafraîchissements ne touchent pas un seul nœud',
    redessins === 0 && liste.reecritures === 1, `${liste.reecritures} écriture(s)`);

  // Un colis change réellement de statut : là, il FAUT redessiner. Une garde qui bloquerait aussi
  // les vraies nouvelles serait bien pire que le problème qu'elle corrige.
  const nouveau = '<div class="colis">Colis 1</div><div class="colis">Colis 2 ✅</div>';
  verifier('un vrai changement passe toujours',
    cltPoserHTML(liste, nouveau) === true && liste.reecritures === 2);
}

/* ---------- 2. Un élément vidé par ailleurs est bien redessiné ---------- */
// La mémoire ne vaut que tant que l'écran correspond. Si quelque chose a vidé la zone entre-temps,
// s'y fier laisserait la page blanche — c'est le pire résultat possible.
titre('Un élément vidé par ailleurs est bien redessiné');
{
  const liste = faireElement();
  const html = '<div>Quelque chose</div>';
  cltPoserHTML(liste, html);
  liste._html = '';                       // quelqu'un d'autre a vidé la zone
  verifier('l\'écran est reconstruit plutôt que laissé blanc', cltPoserHTML(liste, html) === true);
}

/* ---------- 3. L'empreinte rattrape ce qui est ajouté après coup ---------- */
// Plusieurs écrans ajoutent une ligne « Charger plus » APRÈS avoir posé la liste. Ce bouton ne
// figure donc pas dans le texte comparé : sans empreinte, il disparaîtrait ou surgirait sans que
// la comparaison s'en aperçoive.
titre('L\'empreinte rattrape ce qui est ajouté après coup');
{
  const liste = faireElement();
  const html = '<div>Colis</div>';
  cltPoserHTML(liste, html, '1');          // il reste de l'historique à charger
  verifier('même liste, même empreinte : rien à faire', cltPoserHTML(liste, html, '1') === false);
  verifier('même liste, empreinte différente : on redessine', cltPoserHTML(liste, html, '0') === true);
}

/* ---------- 4. La cliente choisie ne disparaît plus toute seule ---------- */
// C'était le « les données saisies s'effacent » le plus visible : la liste des clientes était
// reconstruite toutes les 25 secondes sans rien préserver, et le choix fait dans « Nouveau colis »
// retombait sur « — Sélectionner — » en pleine saisie.
titre('La cliente choisie ne disparaît plus toute seule');
{
  const select = faireElement();
  const options = '<option value="">— Sélectionner —</option><option value="c1">Awa</option><option value="c2">Fatou</option>';
  cltPoserOptions(select, options);
  select.value = 'c2';                      // l'équipe choisit Fatou

  verifier('la liste identique n\'est pas reconstruite', cltPoserOptions(select, options) === false);
  verifier('le choix tient bon', select.value === 'c2', `valeur : ${select.value}`);

  // Une nouvelle cliente s'inscrit : la liste change pour de bon, il faut la reconstruire.
  const plus = options + '<option value="c3">Mariam</option>';
  verifier('une vraie nouvelle cliente entre dans la liste', cltPoserOptions(select, plus) === true);
  verifier('et le choix en cours survit à la reconstruction', select.value === 'c2', `valeur : ${select.value}`);

  // Le compte choisi est supprimé : on retombe sur l'entrée vide, jamais sur la première cliente
  // de la liste — enregistrer un colis au nom de quelqu'un que personne n'a choisi serait grave.
  const sansFatou = '<option value="">— Sélectionner —</option><option value="c1">Awa</option>';
  cltPoserOptions(select, sansFatou);
  verifier('un choix devenu impossible retombe sur le vide, pas sur la première venue',
    select.value === '', `valeur : ${select.value}`);
}

/* ---------- 5. Une liste déroulée compte comme une saisie en cours ---------- */
// Le « ça bloque » des listes déroulantes : le panneau vit dans le <body>, donc aucune des gardes
// posées sur les conteneurs ne le voyait. On était ramené en haut de la liste toutes les
// 25 secondes, en pleine lecture.
titre('Une liste déroulée compte comme une saisie en cours');
{
  const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
  verifier('cltSaisieEnCours interroge bien la liste déroulée',
    /function cltSaisieEnCours[\s\S]{0,400}cltListeDerouleeOuverteDans\(/.test(sourceConfig));
  verifier('CLTRecherche sait dire quelle liste est ouverte',
    /ouverte:\s*function/.test(fs.readFileSync(path.join(APP, 'clt-select-recherche.js'), 'utf8')));

  // Refermer une liste sans rien choisir (Échap, clic à côté) ne produit ni « change » ni
  // « input ». Sans évènement dédié, un rafraîchissement mis en attente le resterait pour
  // toujours, et l'écran se figerait sur des données périmées.
  const recherche = fs.readFileSync(path.join(APP, 'clt-select-recherche.js'), 'utf8');
  verifier('refermer une liste débloque les rafraîchissements en attente',
    /dispatchEvent\(new CustomEvent\('clt-liste-fermee'/.test(recherche));
  verifier('la garde écoute bien cet évènement',
    /addEventListener\("clt-liste-fermee"/.test(sourceConfig));

  // Le défilement du panneau lui-même ne doit pas le faire se repositionner : c'était le
  // tremblement qu'on voyait en parcourant une longue liste à la molette.
  verifier('le défilement du panneau ne le fait pas trembler',
    /closest\('\.clt-rs__panneau'\)\)\s*return;/.test(recherche));
  // Et une reconstruction des options ne doit pas ramener la lecture en haut.
  verifier('la position de lecture est rendue après une reconstruction',
    /var position = liste\.scrollTop;[\s\S]{0,80}liste\.scrollTop = position;/.test(recherche));
}

/* ---------- 6. Aucun écran ne s'est remis à écrire sans comparer ---------- */
// Contrôle de vigilance, pour plus tard : la correction ne vaut que si elle tient. Une seule
// liste qui repasse à `innerHTML = …` suffirait à faire revenir le tremblement sur cet écran.
titre('Aucun écran ne s\'est remis à écrire sans comparer');
for (const [fichier, zones] of [
  ['equipe.html',    ['colis-list', 'compta-detail', 'compta-recap', 'caisse-livreur']],
  ['livreur.html',   ['mes-colis-list', 'recup-colis-list', 'finance-detail']],
  ['fournisseur.html', ['colis-list', 'releve-detail']],
]) {
  const src = fs.readFileSync(path.join(APP, fichier), 'utf8');
  const poses = (src.match(/cltPoserHTML\(/g) || []).length;
  verifier(`${fichier} : la garde est bien en service`, poses >= zones.length,
    `${poses} appel(s) pour ${zones.length} zone(s) sensibles au minimum`);
}

/* Les listes de colis, elles, ne doivent JAMAIS être écrites directement : ce sont elles qui
   portent les champs de saisie et le défilement. */
titre('Les listes de colis passent toutes par la garde');
for (const fichier of ['equipe.html', 'livreur.html', 'fournisseur.html']) {
  const src = fs.readFileSync(path.join(APP, fichier), 'utf8');
  const direct = (src.match(/\blist\.innerHTML\s*=/g) || []).length;
  verifier(`${fichier} : plus aucune écriture directe dans une liste de colis`, direct === 0,
    `${direct} écriture(s) directe(s) restante(s)`);
}

/* La fonction partagée doit vivre dans clt-common.js, chargé par TOUTES les pages — y compris
   les écrans Express, qui n'ont pas config.js. C'est ce qui rend la correction valable
   « partout », mot pour mot ce qui était demandé. */
titre('La garde est disponible sur toutes les pages');
{
  verifier('elle vit dans clt-common.js', /function cltPoserHTML\(/.test(sourceCommun));
  const pages = fs.readdirSync(APP).filter(f => f.endsWith('.html'));
  for (const page of pages) {
    const src = fs.readFileSync(path.join(APP, page), 'utf8');
    if (!/cltPoserHTML\(/.test(src)) continue;   // page qui n'en a pas besoin
    verifier(`${page} charge bien clt-common.js`, /src="clt-common\.js/.test(src));
  }
}

/* ---------- Verdict ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
