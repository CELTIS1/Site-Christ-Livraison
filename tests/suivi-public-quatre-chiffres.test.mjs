/* SUIVI PUBLIC : LES 4 DERNIERS CHIFFRES — 9 septembre 2026 (feuille de route 1.7)
   ==========================================================================================
   Décision de Celtis : le détail d'un colis ne s'affiche qu'après les 4 derniers chiffres du
   téléphone du destinataire. Ce banc tient : la page n'appelle plus que la fonction serveur, à
   deux arguments, et ne lit plus la vue ; une réponse « brute » (sans chiffres) ne montre que le
   numéro, le statut et la date ; le lien WhatsApp ouvre sur le statut et demande les chiffres ;
   l'aperçu WhatsApp est propre ; et le script SQL, quand il est sur le poste, vérifie côté base,
   limite à 5 essais par heure, ne nomme le livreur qu'en livraison, et retire la lecture anonyme.

   Lancer à la main :  node tests/suivi-public-quatre-chiffres.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(RACINE, 'suivi.html'), 'utf8');
const CHEMIN_SQL = path.join(RACINE, '_sql-prive', '2026-09-09-suivi-public-quatre-chiffres.sql');

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

titre('La page ne parle plus qu\'à la fonction serveur, avec les chiffres');
{
  const f = blocDe(page, 'fetchColis');
  verifier('fetchColis(numero, chiffres) appelle suivi_colis avec p_recherche ET p_chiffres', /rpc\("suivi_colis", \{ p_recherche: value, p_chiffres: quatre \|\| null \}\)/.test(f));
  verifier('les chiffres sont réduits à 4 chiffres, rien d\'autre', /replace\(\/\\D\/g, ''\)\.slice\(-4\)/.test(f));
  verifier('si la base a encore l\'ancienne signature, on réessaie avec le seul numéro (jamais de page cassée)', /ancienneSignature = true/.test(f) && /rpc\("suivi_colis", \{ p_recherche: value \}\)/.test(f));
  verifier('la page ne lit plus la vue colis_suivi_public en direct', !/from\("colis_suivi_public"\)/.test(page) && !/SUIVI_COL_VARIANTS/.test(page));
}

titre('Sans les chiffres : le statut, et la demande des chiffres');
{
  const ctx = vm.createContext({});
  vm.runInContext(blocDe(page, 'reponseBrute'), ctx);
  const brute = vm.runInContext('reponseBrute', ctx);
  verifier('une réponse sans description, destination, montant ni photo est « brute »', brute({ numero: 'CLT-1', statut: 'en_livraison', created_at: '2026-09-09T08:00:00Z' }) === true);
  verifier('une réponse complète ne l\'est pas', brute({ numero: 'CLT-1', statut: 'livre', destination: 'Riviera', description: 'Sac', montant_total: 5000 }) === false);
  verifier('rien n\'est pas une réponse brute', brute(null) === false);
  const rendu = blocDe(page, 'renderColis');
  verifier('la réponse brute affiche numéro, statut, date — et demande les 4 chiffres', /if \(reponseBrute\(data\)\)/.test(rendu) && /4 derniers chiffres du numéro de téléphone du destinataire/.test(rendu) && /Ces chiffres ne correspondent pas/.test(rendu));
  verifier('le champ des 4 chiffres est sur le formulaire, clavier numérique', /id="chiffres-input"[^>]*inputmode="numeric"[^>]*maxlength="4"/.test(page));
  verifier('le lien WhatsApp (?numero=) ouvre sur le statut et pose le curseur sur les chiffres', /runSearch\(valueFromUrl\.trim\(\), ''\);/.test(page) && /chiffresInput\.focus\(\)/.test(page));
  verifier('le rafraîchissement automatique garde les bons chiffres, mais ne renvoie jamais des chiffres refusés (chaque renvoi compterait comme un essai)', /fetchColis\(currentNumero, chiffresRefuses \? '' : currentChiffres\)/.test(page) && /chiffresRefuses = !!currentChiffres && reponseBrute\(data\);/.test(page));
}

titre('L\'aperçu WhatsApp du lien');
{
  verifier('og:title, og:description, og:image sont posés', /property="og:title"/.test(page) && /property="og:description"/.test(page) && /property="og:image" content="https:\/\/christlivraison\.ci\/images\/icons\/icon-512\.png"/.test(page));
  verifier('l\'image existe dans le site', fs.existsSync(path.join(RACINE, 'images', 'icons', 'icon-512.png')));
  verifier('aucune donnée personnelle dans l\'aperçu', !/og:description" content="[^"]*(0[0-9]{9}|CLT-)/.test(page));
}

titre('Le script SQL (quand il est sur le poste)');
if (!fs.existsSync(CHEMIN_SQL)) {
  console.log('  ⏭️  NON VÉRIFIÉ ici : _sql-prive/ n\'est pas publié ; ce contrôle ne tourne que sur le poste de travail.');
} else {
  const sql = fs.readFileSync(CHEMIN_SQL, 'utf8');
  verifier('la fonction prend (p_recherche, p_chiffres) et remplace l\'ancienne', /drop function if exists public\.suivi_colis\(text\);/.test(sql) && /function public\.suivi_colis\(p_recherche text, p_chiffres text default null\)/.test(sql));
  verifier('les chiffres se comparent à la fin du téléphone du destinataire, côté base', /right\(regexp_replace\(coalesce\(v_colis\.destinataire_telephone, ''\), '\\D', '', 'g'\), 4\)/.test(sql));
  verifier('5 essais par numéro et par heure, puis même réponse qu\'un chiffre faux', /coalesce\(v_essais, 0\) >= 5/.test(sql) && /on conflict \(numero, heure\) do update set nb = public\.suivi_tentatives\.nb \+ 1/.test(sql));
  verifier('sans chiffres ou chiffres faux : numéro, statut, date — le reste à null', (sql.match(/null::text, null::text, null::text, null::text, null::text,\s*null::numeric, null::text, null::text, null::text, v\.created_at/g) || []).length === 3);
  verifier('le livreur n\'est nommé qu\'en livraison', /case when c\.statut = 'en_livraison' then p\.full_name/.test(sql) && !/statut in \('recupere', 'en_livraison'\)/.test(sql));
  verifier('le visiteur anonyme ne lit plus la vue', /revoke select on public\.colis_suivi_public from anon;/.test(sql));
  verifier('la table des essais n\'est lisible par personne d\'autre que la fonction', /revoke all on public\.suivi_tentatives from anon, authenticated;/.test(sql));
  verifier('inscrite au registre', /migration_appliquee\('2026-09-09-suivi-public-quatre-chiffres\.sql'/.test(sql));
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
