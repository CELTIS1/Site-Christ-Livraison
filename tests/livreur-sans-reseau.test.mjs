/* LE LIVREUR SANS RÉSEAU N'EST PLUS DÉCONNECTÉ — 7 septembre 2026 (feuille de route 1.6)
   ==========================================================================================
   getProfile() rendait null sur une panne de réseau ; les écrans lisaient ce null comme « pas
   ce rôle » et renvoyaient la personne vers un autre espace, qui la déconnectait. Ce banc
   EXÉCUTE chargerProfil() sur une fausse base : réseau coupé avec copie → le profil de la
   copie, marqué hors ligne ; réseau coupé sans copie → null, marqué hors ligne (l'écran
   propose de réessayer) ; refus du serveur → null, pas hors ligne (l'écran redirige) ; lecture
   réussie → copie mise à jour. Puis il vérifie que les trois écrans lisent ce drapeau, et que
   le téléphone garde et ressert sa dernière liste.

   Lancer à la main :  node tests/livreur-sans-reseau.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const config = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const fournisseur = fs.readFileSync(path.join(APP, 'fournisseur.html'), 'utf8');
const commun = fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8');
const style = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }
function blocDe(src, nom){
  const debut = src.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  process.exit(1);
}

// Le bac à sable : un localStorage, un navigateur, une base dont on décide la réponse.
const memoire = new Map();
const localStorage = { getItem: k => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => memoire.set(k, String(v)), removeItem: k => memoire.delete(k) };
let reponseBase = { data: null, error: null };
let lancer = null;
const supabaseClient = { from: () => ({ select: () => ({ eq: () => ({ single: async () => { if (lancer) throw lancer; return reponseBase; } }) }) }) };
const ctx = vm.createContext({ console: { warn(){}, error(){} }, window: { localStorage }, navigator: { onLine: true }, supabaseClient, JSON, String, Date, Array, Object });
['estErreurDeReseau', 'cleProfilEnCache', 'profilEnCache', 'memoriserProfil', 'chargerProfil'].forEach(n => vm.runInContext(blocDe(config, n), ctx));
const chargerProfil = vm.runInContext('chargerProfil', ctx);
const estErreurDeReseau = vm.runInContext('estErreurDeReseau', ctx);
const UID = 'be560b00-0000-4000-8000-000000000001';
const PROFIL = { id: UID, role: 'livreur', full_name: 'Gbei Franck', status: 'valide' };

titre('Reconnaître une panne de réseau, et ne pas la confondre avec un refus');
{
  verifier('« TypeError: Failed to fetch » sans code, c\'est le réseau', estErreurDeReseau({ message: 'TypeError: Failed to fetch', code: '' }));
  verifier('« Load failed » (Safari) aussi', estErreurDeReseau({ message: 'Load failed' }));
  verifier('un 503 aussi', estErreurDeReseau({ status: 503, message: 'Service unavailable' }));
  verifier('un refus PostgREST avec code (PGRST116 : pas de ligne) n\'est PAS le réseau', !estErreurDeReseau({ message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }));
  verifier('un refus de droits (42501) non plus', !estErreurDeReseau({ message: 'permission denied for table profiles', code: '42501' }));
  verifier('rien → non', !estErreurDeReseau(null));
}

titre("chargerProfil() : ce qu'il rend selon la situation");
{
  reponseBase = { data: PROFIL, error: null };
  const ok = await chargerProfil(UID);
  verifier('lecture réussie : le profil, pas hors ligne', ok.profil && ok.profil.role === 'livreur' && ok.horsLigne === false);
  verifier('…et une copie est gardée sur l\'appareil, par utilisateur', memoire.has('clt:profil:' + UID) && JSON.parse(memoire.get('clt:profil:' + UID)).profil.id === UID);

  reponseBase = { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } };
  const coupe = await chargerProfil(UID);
  verifier('réseau coupé, copie présente : le profil de la copie, marqué hors ligne', coupe.profil && coupe.profil.full_name === 'Gbei Franck' && coupe.horsLigne === true && !!coupe.memoriseLe);

  lancer = new TypeError('Failed to fetch'); const lance = await chargerProfil(UID); lancer = null;
  verifier('même quand fetch LÈVE une exception au lieu de la rendre', lance.profil && lance.horsLigne === true);

  memoire.clear();
  const sansCopie = await chargerProfil(UID);
  verifier('réseau coupé, aucune copie : null, mais marqué hors ligne (l\'écran proposera de réessayer)', sansCopie.profil === null && sansCopie.horsLigne === true);

  reponseBase = { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
  const refus = await chargerProfil(UID);
  verifier('refus du serveur : null, PAS hors ligne (l\'écran redirige, comme avant)', refus.profil === null && refus.horsLigne === false);

  reponseBase = { data: PROFIL, error: null }; await chargerProfil(UID);
  reponseBase = { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } };
  const autre = await chargerProfil('autre-utilisateur');
  verifier('la copie d\'un utilisateur ne sert jamais à un autre', autre.profil === null && autre.horsLigne === true);
}

titre('Les trois écrans lisent le drapeau : sans réseau, personne n\'est renvoyé');
{
  for (const [nom, src] of [['livreur', livreur], ['equipe', equipe], ['fournisseur', fournisseur]]) {
    const init = blocDe(src, 'init');
    verifier(`${nom}.html passe par chargerProfil()`, /const lecture = await chargerProfil\(currentUser\.id\);/.test(init) && !/await getProfile\(currentUser\.id\)/.test(init));
    verifier(`${nom}.html : sans réseau et sans copie, il propose de réessayer au lieu de rediriger`, /if \(!profile && lecture\.horsLigne\) \{ afficherSansReseau(CLT)?\(\); return; \}/.test(init));
  }
  verifier('l\'écran « Pas de réseau » existe pour les espaces communs (clt-common.js) et pour le livreur', /function afficherSansReseauCLT\(\)/.test(commun) && /function afficherSansReseau\(\)/.test(livreur));
  verifier('il ne déconnecte pas : « Réessayer » recharge, rien d\'autre', /window\.location\.reload\(\)/.test(blocDe(livreur, 'afficherSansReseau')) && !/signOut|clearAllAuthStorage/.test(blocDe(livreur, 'afficherSansReseau')));
  verifier('il est habillé', /\.sans-reseau\{/.test(style));
  verifier('à la déconnexion, les copies partent avec la session', /\/\^clt:\(profil\|colis\):\//.test(blocDe(config, 'clearAllAuthStorage')));
}

titre('Le téléphone garde sa dernière liste et la ressert sans réseau');
{
  const charge = blocDe(livreur, 'loadColis');
  verifier('chaque lecture réussie est copiée sur l\'appareil', /memoriserColis\(data\);/.test(charge));
  verifier('une panne de réseau ressert la copie, avec le bandeau, sans déconnecter', /if \(estPanneReseau\(error\)\)/.test(charge) && /const memo = colisEnCache\(\);/.test(charge) && /afficherBandeauHorsLigne\(\);/.test(charge) && !/signOut|location\.href/.test(charge));
  verifier('une panne pendant qu\'une liste est déjà à l\'écran ne l\'efface pas', /if \(memo && !allColis\.length\)/.test(charge));
  verifier('le bandeau dit l\'heure de la copie et propose « Réessayer »', /vue hors ligne du \$\{quand\}/.test(livreur) && /id="btn-reessayer-lecture"/.test(livreur));
  verifier('le retour de la connexion relit tout seul', /window\.addEventListener\('online', \(\) => \{ flushOfflineQueue\(\); if \(vueHorsLigne\.active\) loadColis\(\); \}\);/.test(livreur));
  verifier('la file d\'attente hors-ligne existante n\'est pas touchée (queueAdd, flushOfflineQueue toujours là)', /async function queueAdd\(/.test(livreur) && /async function flushOfflineQueue\(/.test(livreur));
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
