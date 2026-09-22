/* LES CLÉS DU SERVEUR — UNE SEULE PORTE, LA MÊME PARTOUT (22 septembre 2026)
   ==========================================================================================
   POURQUOI CE BANC EXISTE. Le 21/09 au soir, une requête a fait remonter en clair la clé
   `service_role` du projet (incident 21.29). Sur ce projet, cette clé ne peut plus être
   changée : Supabase a migré les signatures vers une clé moderne et ne propose plus de
   régénérer l'ancien secret partagé. Le seul geste qui la neutralise est « Disable JWT-based
   API keys », et il coupe d'un coup TOUT ce qui lit `SUPABASE_SERVICE_ROLE_KEY` — c'est-à-dire
   les vingt fonctions du serveur : créer un compte, réinitialiser un mot de passe, Express,
   les notifications.

   LE REMÈDE, ET CE QUE CE BANC GARDE. Chaque fonction lit désormais la NOUVELLE clé
   (`SUPABASE_SECRET_KEYS`) et ne retombe sur l'héritée qu'en second recours. Écrit ainsi, le
   même code marche avant la coupure et après : on peut déployer une fonction à la fois, sans
   fenêtre de casse. Ce banc tient quatre promesses :
     1. plus aucune fonction ne lit une clé héritée en direct ;
     2. le bloc est IDENTIQUE, caractère par caractère, dans les vingt — une copie qui dérive
        est une porte qui reste ouverte le jour de la coupure, et on ne la verrait pas ;
     3. le bloc fait bien ce qu'il dit, éprouvé sur les formes que peut prendre le dictionnaire ;
     4. et AILLEURS dans le dépôt — le site, la sauvegarde nocturne, les flux de travail —
        plus rien n'attend une clé héritée. La coupure a eu lieu le 22/09 au matin : ce qui
        l'attendrait encore échouerait, et pour la sauvegarde, échouerait en silence.

   Le troisième point demande d'EXÉCUTER du TypeScript depuis Node. On retire les annotations
   de type avec une liste explicite, et on refuse de continuer si l'une d'elles ne s'applique
   pas au nombre attendu : ainsi, le jour où quelqu'un écrira le bloc autrement, le banc
   s'arrêtera net au lieu d'éprouver silencieusement autre chose que le vrai code.

   Lancer à la main :  node tests/les-cles-du-serveur.test.mjs
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = path.join(RACINE, 'supabase-functions');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 400) : '')); }
}

const DEBUT = '/* ——— LES CLÉS DU PROJET';
const FIN = '/* ——— fin du bloc « les clés du projet » ——— */';

const fonctions = fs.readdirSync(DOSSIER, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(DOSSIER, e.name, 'index.ts')))
  .map((e) => e.name).sort();

console.log('\n1. LE BLOC DE RÉFÉRENCE EXISTE, ET IL EST SEUL');
const reference = lire('supabase-functions/_cles-du-projet.ts');
const iRef = reference.indexOf(DEBUT), jRef = reference.indexOf(FIN);
verifier('le fichier de référence porte le bloc, ouvert et refermé', iRef >= 0 && jRef > iRef);
const BLOC = iRef >= 0 && jRef > iRef ? reference.slice(iRef, jRef + FIN.length) : '';
verifier('il dit à qui veut le modifier où est la référence et quel outil la repose',
  /_cles-du-projet\.ts/.test(BLOC) && /_poser-le-bloc-des-cles\.mjs/.test(reference));
verifier('il dit POURQUOI ce travail a eu lieu — l\'incident, pas seulement la mécanique',
  /21\.29/.test(BLOC) && /Disable JWT-based API keys/.test(BLOC));
/* Vingt fonctions le 22/09. On ne fige pas le nombre — une fonction de plus demain ne doit pas
   faire rougir ce banc — mais on refuse qu'il tombe à rien : un dossier vide passerait tout. */
verifier('il y a bien des fonctions à garder', fonctions.length >= 15, fonctions.length + ' fonction(s)');

console.log('\n2. LA MÊME PORTE DANS CHAQUE FONCTION, CARACTÈRE PAR CARACTÈRE');
const sansBloc = [], divergentes = [], enDouble = [];
for (const nom of fonctions) {
  const src = lire('supabase-functions/' + nom + '/index.ts');
  const i = src.indexOf(DEBUT), j = src.indexOf(FIN);
  if (i < 0 || j < 0) { sansBloc.push(nom); continue; }
  if (src.slice(i, j + FIN.length) !== BLOC) divergentes.push(nom);
  if (src.indexOf(DEBUT, i + 1) >= 0) enDouble.push(nom);
}
verifier('les ' + fonctions.length + ' fonctions portent le bloc', sansBloc.length === 0, sansBloc.join(', '));
verifier('aucune copie n\'a dérivé de la référence', divergentes.length === 0, divergentes.join(', '));
verifier('aucune ne le porte deux fois', enDouble.length === 0, enDouble.join(', '));

console.log('\n3. PLUS AUCUNE LECTURE DIRECTE D\'UNE CLÉ HÉRITÉE');
/* On regarde le code HORS du bloc : à l'intérieur, la mention des clés héritées est justement
   le second recours, et elle doit y rester. */
const horsBloc = (src) => {
  const i = src.indexOf(DEBUT), j = src.indexOf(FIN);
  return i < 0 || j < 0 ? src : src.slice(0, i) + src.slice(j + FIN.length);
};
const fautives = [], sansClient = [];
for (const nom of fonctions) {
  const src = lire('supabase-functions/' + nom + '/index.ts');
  const dehors = horsBloc(src);
  if (/Deno\.env\.get\(\s*["'](SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY)["']\s*\)/.test(dehors)) fautives.push(nom);
  if (!/cltCleSecrete\(\)/.test(dehors)) sansClient.push(nom);
}
verifier('aucune fonction ne lit SUPABASE_SERVICE_ROLE_KEY ni SUPABASE_ANON_KEY en direct',
  fautives.length === 0, fautives.join(', '));
verifier('chacune passe bien par cltCleSecrete() pour sa clé privilégiée',
  sansClient.length === 0, sansClient.join(', '));
/* Le contrôle du contrôle : si le motif ci-dessus ne voyait rien, ce banc passerait au vert en
   ne cherchant pas. On lui donne donc un texte fautif fabriqué, et il doit l'attraper. */
verifier('… et le motif attrape vraiment une lecture directe (contrôle du contrôle)',
  /Deno\.env\.get\(\s*["'](SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY)["']\s*\)/
    .test('const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");'));
verifier('les deux fonctions qui relisent le jeton d\'un appelant passent par cltClePubliable()',
  ['admin-creer-equipe', 'admin-supprimer-compte']
    .every((n) => /cltClePubliable\(\)/.test(horsBloc(lire('supabase-functions/' + n + '/index.ts')))));

console.log('\n4. CE QUE LE BLOC FAIT VRAIMENT, ÉPROUVÉ EN L\'EXÉCUTANT');
/* Retrait des annotations de type, une par une, avec le nombre attendu. Si le bloc change de
   forme, on s'arrête ici plutôt que d'éprouver un code qui ne serait plus le sien. */
const RETRAITS = [
  [/\(dictionnaire: string, prefixe: string, heritee: string\): string/g, '(dictionnaire, prefixe, heritee)', 1],
  [/\(v: unknown, profondeur: number\): void/g, '(v, profondeur)', 1],
  [/ as Record<string, unknown>/g, '', 1],
  [/function (cltCleSecrete|cltClePubliable)\(\): string/g, 'function $1()', 2],
];
let js = BLOC;
let formeConnue = true;
for (const [motif, remplacement, attendu] of RETRAITS) {
  const n = (js.match(motif) || []).length;
  if (n !== attendu) { formeConnue = false; console.log('       → annotation inattendue : ' + motif + ' vue ' + n + ' fois au lieu de ' + attendu); }
  js = js.replace(motif, remplacement);
}
verifier('le bloc a la forme attendue — on éprouve bien le vrai code', formeConnue);
verifier('… et une fois les types retirés, il ne reste aucune annotation',
  !/:\s*(string|unknown|number|void)\b/.test(js) && !/\bas Record</.test(js), js.slice(0, 200));

/* On fabrique un faux Deno.env pour chaque cas, et on rejoue le bloc dessus. */
function essayer(env) {
  const faux = { env: { get: (k) => (Object.prototype.hasOwnProperty.call(env, k) ? env[k] : undefined) } };
  const usine = new Function('Deno', js + '\nreturn { secrete: cltCleSecrete, publiable: cltClePubliable };');
  const { secrete, publiable } = usine(faux);
  return { secrete: secrete(), publiable: publiable() };
}
const HERITEE = 'eyJ-fausse-cle-heritee-pour-le-banc';
verifier('rien du tout : on rend une chaîne vide, jamais undefined — la fonction dira « clé absente », elle ne plantera pas',
  essayer({}).secrete === '' && essayer({}).publiable === '');
verifier('seulement l\'héritée (AUJOURD\'HUI, avant la coupure) : on la prend',
  essayer({ SUPABASE_SERVICE_ROLE_KEY: HERITEE }).secrete === HERITEE);
verifier('le dictionnaire écrit en objet — la forme annoncée par Supabase',
  essayer({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_AAA"}', SUPABASE_SERVICE_ROLE_KEY: HERITEE }).secrete === 'sb_secret_AAA');
verifier('… en liste d\'objets, une autre forme possible',
  essayer({ SUPABASE_SECRET_KEYS: '[{"name":"default","api_key":"sb_secret_BBB"}]' }).secrete === 'sb_secret_BBB');
verifier('… ou une simple chaîne, si Supabase la pose telle quelle',
  essayer({ SUPABASE_SECRET_KEYS: 'sb_secret_CCC' }).secrete === 'sb_secret_CCC');
verifier('LA NOUVELLE PASSE AVANT L\'HÉRITÉE — sinon la coupure de demain casserait tout',
  essayer({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_DDD"}', SUPABASE_SERVICE_ROLE_KEY: HERITEE }).secrete === 'sb_secret_DDD');
verifier('un dictionnaire illisible ne fait pas tomber la fonction : on retombe sur l\'héritée',
  essayer({ SUPABASE_SECRET_KEYS: '{ceci n\'est pas du JSON', SUPABASE_SERVICE_ROLE_KEY: HERITEE }).secrete === HERITEE);
verifier('un dictionnaire sans aucune clé au bon préfixe : on retombe aussi',
  essayer({ SUPABASE_SECRET_KEYS: '{"vide":"","autre":123}', SUPABASE_SERVICE_ROLE_KEY: HERITEE }).secrete === HERITEE);
verifier('on ne confond JAMAIS les deux familles : une clé publiable ne peut pas servir de clé secrète',
  essayer({ SUPABASE_SECRET_KEYS: '{"x":"sb_publishable_ZZZ"}', SUPABASE_SERVICE_ROLE_KEY: HERITEE }).secrete === HERITEE);
verifier('… et réciproquement, la publiable lit sa propre famille',
  essayer({ SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_EEE"}' }).publiable === 'sb_publishable_EEE'
  && essayer({ SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_EEE"}' }).secrete === '');
verifier('le dictionnaire vide ou en blanc vaut « pas de dictionnaire »',
  essayer({ SUPABASE_SECRET_KEYS: '   ', SUPABASE_SERVICE_ROLE_KEY: HERITEE }).secrete === HERITEE);
verifier('une clé enfouie plus profond est quand même trouvée',
  essayer({ SUPABASE_SECRET_KEYS: '{"a":{"b":[{"c":"sb_secret_FFF"}]}}' }).secrete === 'sb_secret_FFF');
/* Un dictionnaire qui se replierait sur lui-même n'existe pas en JSON, mais un très profond,
   oui. Le bloc s'arrête à quatre niveaux : il doit rendre la main, pas tourner sans fin. */
verifier('un dictionnaire absurdement profond ne fait pas tourner la fonction sans fin',
  essayer({ SUPABASE_SECRET_KEYS: '{"a":{"b":{"c":{"d":{"e":{"f":"sb_secret_GGG"}}}}}}', SUPABASE_SERVICE_ROLE_KEY: HERITEE }).secrete === HERITEE);

console.log('\n5. L\'OUTIL QUI REPOSE LE BLOC EST LÀ, ET IL SAIT SE CONTRÔLER');
const outil = lire('supabase-functions/_poser-le-bloc-des-cles.mjs');
verifier('il existe et sait vérifier sans écrire (--verifier)', /--verifier/.test(outil));
verifier('il pose le bloc après le dernier import, une seule fois', /dernierImport/.test(outil) && /indexOf\(DEBUT/.test(outil));

console.log('\n6. AILLEURS DANS LE DÉPÔT : PLUS RIEN NE DOIT ATTENDRE UNE CLÉ HÉRITÉE');
/* Le 22/09/2026, les clés héritées (anon, service_role) ont été DÉSACTIVÉES sur le projet et
   leur signature révoquée. Tout ce qui les attendrait encore échouerait — et, pour la
   sauvegarde nocturne, échouerait en silence, chaque nuit. Ce contrôle regarde donc hors des
   fonctions : le site, la sauvegarde, les flux de travail. */
const ailleurs = [
  'sauvegarde/exporter-les-fichiers.mjs',
  'sauvegarde/README.md',
  '.github/workflows/sauvegarde.yml',
  'app/config.js',
  'app/express-config.js',
];
const encoreHeritees = ailleurs.filter((c) => {
  const src = lire(c);
  /* On accepte la MENTION de l'ancien nom là où elle explique qu'il ne marche plus, ou là où
     il sert de second recours nommé. Ce qu'on refuse, c'est qu'on l'ATTENDE : un secret de
     dépôt à ce nom, ou une lecture qui n'aurait pas d'autre source. */
  if (/secrets\.SUPABASE_SERVICE_ROLE_KEY|secrets\.SUPABASE_ANON_KEY/.test(src)) return true;
  if (/process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(src) && !/process\.env\.SUPABASE_SECRET_KEY/.test(src)) return true;
  return false;
});
verifier('aucun fichier hors des fonctions n\'attend encore une clé héritée',
  encoreHeritees.length === 0, encoreHeritees.join(', '));
verifier('le site se connecte avec la clé publiable, pas avec une clé héritée',
  /sb_publishable_/.test(lire('app/config.js')) && /sb_publishable_/.test(lire('app/express-config.js'))
  && !/eyJ[A-Za-z0-9_-]{20,}/.test(lire('app/config.js')));
/* Contrôle du contrôle : le motif doit attraper un secret de dépôt à l'ancien nom. */
verifier('… et le motif attrape vraiment un secret de dépôt à l\'ancien nom',
  /secrets\.SUPABASE_SERVICE_ROLE_KEY/.test('SR: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}'));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
