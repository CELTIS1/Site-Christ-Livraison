/* LE SERVEUR ET L'ÉCRAN COMPTENT PAREIL — 29 août 2026
   ==========================================================================================

   POURQUOI CE BANC D'ESSAI EXISTE
   -------------------------------
   La règle de l'argent du livreur est écrite à DEUX endroits, et c'est voulu : en JavaScript
   dans app/config.js (montantEnMainDuLivreur), parce qu'un écran doit afficher un montant sans
   attendre le réseau d'Abidjan ; en SQL dans la base, parce que c'est la base qui tranche au
   moment d'enregistrer la remise, et qu'un chiffre venu du navigateur n'est pas une preuve.

   MESURE DU 29 AOÛT 2026. La fonction vivante en base a été relue telle qu'elle s'exécute
   (pg_get_functiondef : 2 673 caractères, empreinte 68933f454fb108aadbeeed853a6554b7) et
   confrontée condition par condition à app/config.js. Elles étaient d'accord. Sur les vrais
   colis du matin, un recoupement SQL écrit à part, sans réutiliser une ligne du site, a donné
   les mêmes chiffres au franc : Cedric 43 colis / 428 500, GONSON Christ 36 / 322 400,
   Eric Zokou 41 / 266 000, Sanogo Fa Yacouba 28 / 199 000, Gbei Franck 60 / 124 150 —
   TOTAL 208 colis et 1 340 050 FCFA chez cinq livreurs.

   Ce n'était pas garanti, c'était constaté. Le trou n'était pas là.

   LE TROU, NOMMÉ PRÉCISÉMENT
   --------------------------
   RIEN NE LES VERRAIT DIVERGER. La garde qui existait (section 5 de controle-croise-des-ecrans)
   compare des MOTS et lit un FICHIER. Or ces fonctions se déploient en collant du SQL dans
   l'éditeur Supabase : le jour où quelqu'un modifie la base et oublie le fichier, le fichier
   reste juste, les 2 531 contrôles restent verts, et le serveur calcule autre chose que
   l'écran. C'est la forme exacte de l'incident du 25 août 2026, où le téléphone du livreur
   disait 11 000 et le tableau du bureau 14 000.

   CE QUE CE BANC D'ESSAI GARDE
   ----------------------------
     1. LE VERDICT NE SE TROMPE PAS DE SENS. Un franc d'écart se voit, dans les deux sens, et
        « je ne sais pas » ne s'affiche jamais comme « il y a un écart ».
     2. LE BANDEAU PORTE SES TROIS CHIFFRES : celui de l'écran, celui de la base, et l'écart.
        Un avertissement d'argent sans ses montants n'est pas vérifiable.
     3. IL SE TAIT QUAND TOUT VA BIEN. Un encadré vert à chaque remise deviendrait un décor.
     4. L'ÉCRAN INTERROGE VRAIMENT LA BASE, avant que le montant reçu ne soit saisi, et sans
        faire dépendre l'ouverture de la fenêtre de la 4G.
     5. LA RÈGLE N'EST ÉCRITE QU'UNE FOIS DU CÔTÉ SERVEUR. L'enregistrement ne refait plus le
        calcul : il appelle le même endroit que l'écran a interrogé une seconde plus tôt.
     6. LES DEUX RÈGLES LISENT LES MÊMES COLONNES. Une colonne oubliée d'un côté, c'est un
        terme d'argent qui disparaît d'un seul des deux calculs.
   ========================================================================================== */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const common = fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');

/* LA RÈGLE DU SERVEUR SE LIT DANS SA DERNIÈRE VERSION, PAS DANS SA PREMIÈRE. (01/09/2026)

   Ce banc d'essai ouvrait le seul script du 29 août. Or une règle de calcul se réécrit : le
   1er septembre, montant_en_main_du_livreur() a été redéfinie dans un script plus récent pour
   exclure les expéditions. Le banc d'essai a continué de lire l'ancienne définition, s'est
   déclaré satisfait, et n'a rien vu du désaccord qu'il existe précisément pour détecter.

   On cherche donc, parmi tous les scripts, celui qui définit cette fonction EN DERNIER — les
   noms de fichier commencent par une date, l'ordre alphabétique est donc l'ordre chronologique.
   C'est bien la dernière définition exécutée qui fait foi dans la base. */
const DOSSIER_SQL = path.join(RACINE, '_sql-prive');
// Le script fondateur : c'est lui qui porte les trois fonctions et leurs droits. Il ne bouge pas.
const CHEMIN_SQL = path.join(DOSSIER_SQL, '2026-08-29-le-serveur-annonce-son-chiffre.sql');
// Et la DERNIÈRE réécriture de la règle d'argent, où qu'elle soit. Voir ci-dessus.
const CHEMIN_REGLE = (() => {
  if (!fs.existsSync(DOSSIER_SQL)) return path.join(DOSSIER_SQL, 'absent.sql');
  const candidats = fs.readdirSync(DOSSIER_SQL)
    .filter(f => f.endsWith('.sql'))
    .filter(f => /create or replace function public\.montant_en_main_du_livreur/
      .test(fs.readFileSync(path.join(DOSSIER_SQL, f), 'utf8')))
    .sort();
  return path.join(DOSSIER_SQL, candidats[candidats.length - 1] || 'absent.sql');
})();

let reussies = 0, echouees = 0, ignorees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function ignorer(t, pourquoi){ ignorees++; console.log('  ➖ ' + t + ' — ' + pourquoi); }
function titre(t){ console.log('\n' + t); }

/* ---------- Extraction du vrai code ----------
   On ne recopie jamais une fonction dans un banc d'essai : la copie finit toujours par rester
   juste pendant que l'original devient faux, et le banc annonce alors que tout va bien au
   moment précis où plus rien ne va. */
function blocDe(src, nom, ouQuoi){
  const debut = src.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans ${ouQuoi}`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable dans ${ouQuoi}`); process.exit(1);
}

function sansCommentaires(src){
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

// Le corps d'une fonction SQL, entre ses deux $$. On coupe aussi les commentaires « -- »,
// sinon un mot cité dans une explication passerait pour du code exécuté.
function corpsSQL(src, nom){
  const debut = src.search(new RegExp('create or replace function public\\.' + nom + '\\b'));
  if (debut === -1) return null;
  const a = src.indexOf('$$', debut);
  const b = src.indexOf('$$', a + 2);
  if (a === -1 || b === -1) return null;
  return src.slice(a + 2, b).replace(/^\s*--.*$/gm, '');
}

/* ---------- Le bac à sable ---------- */
const contexte = vm.createContext({ console });
vm.runInContext(['formatMontant', 'escapeHTML'].map(n => blocDe(common, n, 'clt-common.js')).join('\n\n'), contexte);
vm.runInContext([
  // La règle de comparaison est descendue dans accordDeDeuxMontants le 29 août 2026, quand
  // l'annonce du livreur est devenue un troisième couple de montants à confronter. Le verdict
  // du serveur et de l'écran n'est plus qu'un habillage de noms par-dessus.
  'accordDeDeuxMontants',
  'accordDuServeurEtDeLEcran',
  'accordRemiseHTML',
].map(n => blocDe(sourceConfig, n, 'config.js')).join('\n\n'), contexte);

const { accordDuServeurEtDeLEcran, accordRemiseHTML, formatMontant } = contexte;

const configNu = sansCommentaires(sourceConfig);
const equipeNu = sansCommentaires(equipe);

/* ============================================================================================
   1. LE VERDICT NE SE TROMPE PAS DE SENS
   ============================================================================================ */
titre("Le verdict ne se trompe pas de sens");

const daccord = accordDuServeurEtDeLEcran(428500, 428500);
verifier("deux chiffres identiques : connu, d'accord, écart nul",
  daccord.connu === true && daccord.accord === true && daccord.ecart === 0,
  JSON.stringify(daccord));

const unFrancDeTrop = accordDuServeurEtDeLEcran(428501, 428500);
verifier("un seul franc de trop à l'écran est un désaccord, et l'écart est positif",
  unFrancDeTrop.connu === true && unFrancDeTrop.accord === false && unFrancDeTrop.ecart === 1,
  "un contrôle d'argent qui tolère un franc tolérera bientôt un billet");

const unFrancDeMoins = accordDuServeurEtDeLEcran(428499, 428500);
verifier("un franc de moins à l'écran est un désaccord, et l'écart est négatif",
  unFrancDeMoins.connu === true && unFrancDeMoins.accord === false && unFrancDeMoins.ecart === -1,
  JSON.stringify(unFrancDeMoins));

const incident = accordDuServeurEtDeLEcran(14000, 11000);
verifier("l'incident du 25 août serait vu : 14 000 à l'écran contre 11 000 en base",
  incident.connu === true && incident.accord === false && incident.ecart === 3000
  && incident.ecran === 14000 && incident.serveur === 11000,
  JSON.stringify(incident));

for (const rien of [null, undefined, '', NaN, 'beaucoup', {}]) {
  const v = accordDuServeurEtDeLEcran(428500, rien);
  verifier(`serveur muet (${JSON.stringify(rien) ?? String(rien)}) : « je ne sais pas », jamais « écart »`,
    v.connu === false && v.accord === false && v.serveur === null,
    "un avertissement qui se déclenche à chaque coupure réseau est ignoré au bout de deux soirs");
}

verifier("un attendu d'écran illisible ne déclenche pas non plus d'alarme",
  [undefined, null, '', NaN, 'beaucoup'].every(v => accordDuServeurEtDeLEcran(v, 428500).connu === false),
  "on n'accuse pas la base quand c'est l'écran qui n'a rien à dire — et Number('') vaut 0, "
  + "donc sans garde-fou le bandeau annoncerait un écart du montant entier");

verifier("zéro contre zéro est un accord connu, pas un silence",
  accordDuServeurEtDeLEcran(0, 0).connu === true && accordDuServeurEtDeLEcran(0, 0).accord === true,
  "confondre « zéro » et « rien » ferait taire le contrôle sur les remises soldées");

verifier("un attendu négatif se compare comme les autres (CLT doit de l'argent au livreur)",
  accordDuServeurEtDeLEcran(-3000, -3000).accord === true
  && accordDuServeurEtDeLEcran(-3000, -2000).ecart === -1000,
  "le cas de l'avance de gare qui dépasse l'encaissé");

verifier("un centième de franc venu d'un numeric PostgreSQL ne réveille personne",
  accordDuServeurEtDeLEcran(428500.4, '428500').accord === true
  && accordDuServeurEtDeLEcran('428500.00', 428500).accord === true,
  "mais l'arrondi ne doit pas non plus avaler un franc entier");

verifier("le franc entier, lui, passe l'arrondi",
  accordDuServeurEtDeLEcran(428500.6, 428500).accord === false,
  "arrondir trop large reviendrait à éteindre le contrôle");

verifier("le verdict ne dépend d'aucun navigateur : ni document, ni fetch, ni supabase",
  !/document\.|fetch\(|supabase/i.test(sansCommentaires(blocDe(sourceConfig, 'accordDuServeurEtDeLEcran', 'config.js'))),
  "c'est ce qui le rend vérifiable ici, et donc réellement vérifié");

/* ============================================================================================
   2. LE BANDEAU PORTE SES TROIS CHIFFRES
   ============================================================================================ */
titre("Le bandeau porte ses trois chiffres, ou ne dit rien");

const bandeau = accordRemiseHTML(incident);
verifier("il nomme le chiffre de l'écran, celui de la base, et l'écart",
  bandeau.includes(formatMontant(14000)) && bandeau.includes(formatMontant(11000))
  && bandeau.includes(formatMontant(3000)),
  "un avertissement d'argent sans ses montants n'est pas vérifiable : " + bandeau);

verifier("il dit dans quel sens penche le désaccord",
  /de plus à l'écran/.test(bandeau) && /de moins à l'écran/.test(accordRemiseHTML(unFrancDeMoins)),
  "« il y a un écart » sans le sens oblige à refaire le calcul à la main");

verifier("l'écart s'affiche en valeur absolue, jamais avec un signe moins collé au format",
  !accordRemiseHTML(unFrancDeMoins).includes('-1') && !accordRemiseHTML(unFrancDeMoins).includes('−1'),
  "« −1 000 de moins » se lit deux fois dans le mauvais sens");

verifier("il dit lequel des deux chiffres sera enregistré",
  /base/i.test(bandeau) && /enregistr/i.test(bandeau),
  "sinon le bureau ne sait pas s'il doit corriger l'écran ou la caisse");

verifier("accord : rien du tout, pas même un encadré vert",
  accordRemiseHTML(daccord) === '',
  "un « tout va bien » à chaque remise deviendrait un décor, et on cesserait de le lire");

verifier("serveur muet : rien du tout",
  accordRemiseHTML(accordDuServeurEtDeLEcran(428500, null)) === ''
  && accordRemiseHTML(undefined) === '' && accordRemiseHTML({}) === '',
  "le silence de la base ne doit jamais ressembler à une alerte");

verifier("le bandeau échappe le texte qu'il insère",
  /escapeHTML\(/.test(sansCommentaires(blocDe(sourceConfig, 'accordRemiseHTML', 'config.js'))));

verifier("le bandeau ne lit pas le document et ne pose aucun gestionnaire",
  !/document\./.test(sansCommentaires(blocDe(sourceConfig, 'accordRemiseHTML', 'config.js')))
  && !/addEventListener/.test(sansCommentaires(blocDe(sourceConfig, 'accordRemiseHTML', 'config.js'))));

verifier("les deux fonctions ne sont déclarées qu'une fois, et dans config.js",
  (configNu.match(/function\s+accordDuServeurEtDeLEcran\s*\(/g) || []).length === 1
  && (configNu.match(/function\s+accordRemiseHTML\s*\(/g) || []).length === 1
  && !/function\s+accordDuServeurEtDeLEcran\s*\(/.test(equipeNu)
  && !/function\s+accordRemiseHTML\s*\(/.test(equipeNu),
  "déclarées en double, le banc lit une version pendant que l'écran exécute l'autre");

/* ============================================================================================
   3. L'ÉCRAN INTERROGE VRAIMENT LA BASE
   ============================================================================================ */
titre("L'écran interroge vraiment la base, et au bon moment");

const demande = sansCommentaires(blocDe(equipe, 'demanderSonChiffreAuServeur', 'equipe.html'));
const ouvre = sansCommentaires(blocDe(equipe, 'showRemiseModal', 'equipe.html'));
const ferme = sansCommentaires(blocDe(equipe, 'hideRemiseModal', 'equipe.html'));

verifier("l'ouverture de la remise déclenche la demande",
  /demanderSonChiffreAuServeur\s*\(/.test(ouvre),
  "sans cet appel, la garde est écrite et ne s'exécute jamais");

verifier("elle ne bloque pas l'ouverture de la fenêtre",
  !/await\s+demanderSonChiffreAuServeur/.test(ouvre),
  "une remise du soir ne doit pas dépendre de la 4G d'Abidjan");

verifier("la demande porte sur la fonction de lecture seule de la base",
  /rpc\(\s*['"]attendu_remise_caisse['"]/.test(demande),
  "aucun autre appel ne prouverait que le chiffre vient bien du serveur");

verifier("elle lui passe le livreur, les colis, et les avances de gare",
  /p_livreur_id\s*:/.test(demande) && /p_colis_ids\s*:/.test(demande)
  && /p_colis_frais_ids\s*:/.test(demande),
  "comparer deux montants calculés sur des colis différents ne prouverait rien");

verifier("elle confronte l'attendu de l'écran à la réponse de la base",
  /accordDuServeurEtDeLEcran\(\s*ctx\.attendu\s*,/.test(demande)
  && /accordRemiseHTML\(/.test(demande),
  "elle refait sa propre comparaison : ce serait un troisième calcul");

verifier("elle ne refait aucune addition d'argent de son côté",
  !/montantEnMainDuLivreur\(/.test(demande) && !/caisseParLivreur\(/.test(demande)
  && !/\breduce\(/.test(demande),
  "l'écran a déjà son chiffre ; en fabriquer un autre ici, c'est le 25 août à nouveau");

verifier("une erreur de la base la fait taire, elle n'invente pas d'écart",
  /if\s*\(\s*error\s*\)\s*return/.test(demande) && /catch\s*\([^)]*\)\s*\{\s*return/.test(demande),
  "droits refusés, fonction pas encore installée, réseau coupé : on se tait");

verifier("une réponse vide la fait taire aussi",
  /attendu\s*===\s*null/.test(demande) && /attendu\s*===\s*undefined/.test(demande),
  "un null pris pour un zéro afficherait un faux écart du montant entier");

verifier("une réponse en retard ne peint pas un avertissement sur un autre livreur",
  /__remiseCtx\s*!==\s*ctx/.test(demande),
  "le bureau ferme et rouvre sur un autre dossier pendant que la requête voyage");

verifier("elle pose le bandeau par cltPoserHTML, pas par innerHTML",
  /cltPoserHTML\(/.test(demande) && !/innerHTML\s*=\s*accordRemiseHTML/.test(demande),
  "la maison passe par cltPoserHTML partout ailleurs");

verifier("l'emplacement du bandeau existe dans la page",
  /id="remise-modal-accord"/.test(equipe),
  "sans lui, la fonction cherche un élément absent et ne dit jamais rien");

verifier("il est placé AVANT le champ du montant reçu",
  equipe.indexOf('id="remise-modal-accord"') !== -1
  && equipe.indexOf('id="remise-modal-accord"') < equipe.indexOf('id="remise-modal-recu"'),
  "un avertissement lu après avoir tapé le montant arrive trop tard");

verifier("la fermeture efface le bandeau",
  /remise-modal-accord/.test(ferme) && /innerHTML\s*=\s*''/.test(ferme),
  "sinon l'écart d'un livreur réapparaîtrait sur la remise du suivant");

/* ============================================================================================
   4. LA RÈGLE N'EST ÉCRITE QU'UNE FOIS DU CÔTÉ SERVEUR
   ============================================================================================ */
titre("La règle n'est écrite qu'une fois du côté serveur");

if (!fs.existsSync(CHEMIN_SQL)) {
  ignorer("le fichier SQL de la garde",
    "_sql-prive n'est pas dans le dépôt public : ces contrôles ne valent qu'en local");
} else {
  const sql = fs.readFileSync(CHEMIN_SQL, 'utf8');
  // La règle vient de sa dernière version, pas forcément de ce fichier-ci.
  const regle = corpsSQL(fs.readFileSync(CHEMIN_REGLE, 'utf8'), 'montant_en_main_du_livreur');
  const lecture = corpsSQL(sql, 'attendu_remise_caisse');
  const ecriture = corpsSQL(sql, 'enregistrer_remise_caisse');

  verifier("les trois fonctions sont bien dans le fichier",
    regle !== null && lecture !== null && ecriture !== null,
    `règle:${regle !== null} lecture:${lecture !== null} écriture:${ecriture !== null}`);

  verifier("la règle d'argent porte ses trois termes : article, livraison, avance de gare",
    /montant_article/.test(regle) && /montant_livraison/.test(regle)
    && /frais_expedition/.test(regle) && /-\s*case when c\.frais_expedition_rembourse_at is null/.test(regle),
    "un terme manquant, c'est un montant faux sans message d'erreur");

  verifier("l'enregistrement ne refait plus le calcul d'argent",
    !/montant_article/.test(ecriture) && !/montant_livraison/.test(ecriture)
    && !/article_non_encaisse/.test(ecriture),
    "deux chemins vers le même montant, c'est deux chemins pour diverger");

  verifier("il demande son chiffre au même endroit que l'écran",
    /attendu_remise_caisse\s*\(/.test(ecriture),
    "c'est ce qui garantit que le montant montré et le montant inscrit sont le même");

  verifier("la lecture seule ne modifie rien",
    !/\b(insert|update|delete|truncate)\b/i.test(lecture),
    "une fonction interrogée à chaque ouverture de fenêtre ne doit rien pouvoir abîmer");

  verifier("la lecture seule est déclarée stable et à search_path fixé",
    /\bstable\b/.test(sql) && /set search_path = public/.test(sql));

  verifier("elle applique les mêmes filtres que l'enregistrement",
    /encaissement_remis, false\) = false/.test(lecture)
    && /frais_expedition_rembourse_at is null/.test(lecture)
    && /livreur_id is not distinct from p_livreur_id/.test(lecture),
    "comparer deux montants calculés sur des ensembles différents ne prouve rien");

  verifier("elle ne dit combien porte un livreur qu'à l'équipe",
    /a_acces_operations\(\) or public\.est_admin\(\)/.test(lecture)
    && /raise exception/.test(lecture),
    "ce n'est pas une information publique");

  verifier("elle est ouverte aux comptes connectés, pas à anon",
    /grant execute on function[\s\S]{0,200}attendu_remise_caisse[\s\S]{0,120}to authenticated/.test(sql)
    && !/to anon/.test(sql));

  verifier("l'enregistrement garde sa signature à cinq arguments, sans drop",
    /p_livreur_id\s+uuid,[\s\S]{0,200}p_colis_frais_ids uuid\[\]/.test(sql)
    && !/drop function/i.test(sql),
    "changer la signature casserait l'appel de equipe.html sans prévenir");

  verifier("l'enregistrement inscrit le montant de la base, pas celui du navigateur",
    /montant_attendu[\s\S]{0,300}v_attendu/.test(ecriture)
    && !/montant_attendu[\s\S]{0,60}p_montant_remis/.test(ecriture),
    "c'est SON chiffre qui doit rester dans remises_caisse");

  /* ------------------------------------------------------------------------------------
     Les mêmes colonnes des deux côtés. On ne compare pas des textes : on relève les
     colonnes que chaque règle LIT réellement, et on exige les mêmes. Une colonne oubliée
     d'un côté, c'est un terme d'argent qui disparaît d'un seul des deux calculs — et
     personne ne le verrait, puisque les deux continueraient de fonctionner.
     ------------------------------------------------------------------------------------ */
  /* CÔTÉ JAVASCRIPT : ON EXÉCUTE, ON NE LIT PAS.

     Ce relevé se faisait par expression régulière, en cherchant « c.quelque_chose » dans le
     texte des fonctions. Le 1er septembre 2026, ce contrôle est passé au VERT alors qu'une
     colonne venait d'apparaître d'un seul côté : montantEnMainDuLivreur() s'était mis à
     dépendre de commune_destination, mais il y accède à travers estExpedition(colisOuCommune),
     dont le paramètre ne s'appelle pas « c ». L'expression régulière ne pouvait pas le voir.

     Un banc d'essai qui cherche un NOM DE VARIABLE dans du texte surveille la façon d'écrire,
     pas ce que le code fait. On exécute donc la vraie règle sur un colis espion — un Proxy qui
     note chaque propriété qu'on lui demande — et on relève ce qui a été lu pour de bon. Un
     renommage de paramètre n'y change plus rien.

     Le colis est joué dans plusieurs états, sans quoi les branches non empruntées cacheraient
     leurs colonnes : un colis d'Abidjan livré, une expédition livrée, un colis pas encore
     livré, un colis ancien sans détail de montants, une avance déjà remboursée. */
  const contexteRegle = vm.createContext({ console });
  // estExpedition() cite cette constante ; on l'extrait du vrai fichier plutôt que de la
  // recopier, une valeur recopiée finissant toujours par mentir.
  vm.runInContext(
    (sourceConfig.match(/^const\s+COMMUNE_EXPEDITION\s*=.*?;\s*$/m) || [''])[0],
    contexteRegle);
  vm.runInContext([
    'estExpedition',
    'colisADetailMontant', 'montantArticleColis', 'montantLivraisonColis',
    'fraisExpeditionColis', 'articleEncaisse', 'livraisonEncaissee',
    'montantArticleEncaisse', 'montantLivraisonEncaissee', 'fraisExpeditionARembourser',
    'montantEnMainDuLivreur',
  ].map(n => blocDe(sourceConfig, n, 'config.js')).join('\n\n'), contexteRegle);
  const COMMUNE_EXP = vm.runInContext('COMMUNE_EXPEDITION', contexteRegle);

  const cotesJS = new Set();
  const espion = (valeurs) => new Proxy(Object.assign({}, valeurs), {
    get(cible, cle) {
      if (typeof cle === 'string') cotesJS.add(cle);
      return cible[cle];
    },
  });
  [
    { statut: 'livre', montant_article: 20000, montant_livraison: 1500, commune_destination: 'Cocody' },
    { statut: 'livre', montant_article: 20000, montant_livraison: 3000, frais_expedition: 2500,
      commune_destination: COMMUNE_EXP },
    { statut: 'recupere', montant_article: 8000, frais_expedition: 2500, commune_destination: COMMUNE_EXP },
    { statut: 'livre', montant: 12000, commune_destination: 'Yopougon' },
    { statut: 'livre', montant_article: 5000, montant_livraison: 1000, commune_destination: 'Abobo',
      article_non_encaisse: true, livraison_payee: true, livraison_non_encaissee: true,
      frais_expedition: 1000, frais_expedition_rembourse_at: '2026-09-01T10:00:00Z' },
  ].forEach(etat => { contexteRegle.montantEnMainDuLivreur(espion(etat)); });

  const colonnes = src => new Set(
    (src.match(/\bc\.([a-z_]+)/g) || []).map(s => s.slice(2))
  );
  const coteSQL = colonnes(regle);
  const manquantSQL = [...cotesJS].filter(x => !coteSQL.has(x));
  const manquantJS = [...coteSQL].filter(x => !cotesJS.has(x));

  verifier(`les deux règles lisent exactement les mêmes ${cotesJS.size} colonnes du colis`,
    manquantSQL.length === 0 && manquantJS.length === 0,
    `absentes du SQL : ${manquantSQL.join(', ') || 'aucune'} · absentes du JS : ${manquantJS.join(', ') || 'aucune'}`);

  // La dixième, commune_destination, est arrivée le 01/09/2026 : sur une expédition le livreur
  // n'encaisse rien, ni l'article ni la course. Elle est nommée ici pour que sa disparition d'un
  // des deux côtés soit une panne bruyante et non un silence.
  verifier("et ces colonnes sont bien les dix attendues, pas un sous-ensemble appauvri",
    ['statut', 'article_non_encaisse', 'livraison_payee', 'livraison_non_encaissee',
     'montant_article', 'montant_livraison', 'montant', 'frais_expedition',
     'frais_expedition_rembourse_at', 'commune_destination'].every(x => cotesJS.has(x) && coteSQL.has(x)),
    [...cotesJS].sort().join(', '));

  verifier("le fichier dit ce qui a été mesuré, et sur quelle base",
    /68933f454fb108aadbeeed853a6554b7/.test(sql) && /2 673/.test(sql),
    "un fichier de migration sans sa mesure oblige à refaire le travail pour le relire");
}

/* ---------- Verdict ---------- */
console.log(`\n${reussies} réussie${reussies > 1 ? 's' : ''}, ${echouees} échouée${echouees > 1 ? 's' : ''}`
  + (ignorees ? `, ${ignorees} ignorée${ignorees > 1 ? 's' : ''}.` : '.'));
process.exit(echouees ? 1 : 0);
