/* LE LIVREUR ANNONCE SA REMISE — 29 août 2026
   ==========================================================================================

   POURQUOI CE BANC D'ESSAI EXISTE
   -------------------------------
   Le soir, le livreur arrivait avec des billets et quelqu'un d'autre saisissait le montant.
   En cas de désaccord, c'était sa parole contre un écran qu'il n'avait jamais touché : de
   toute la chaîne de l'argent, l'homme qui portait les billets était le seul à ne pas pouvoir
   parler. Il annonce maintenant lui-même, avant qu'on ne compte.

   CE QUI A ÉTÉ MESURÉ SUR LA BASE DE PRODUCTION, LE 29 AOÛT 2026
   -------------------------------------------------------------
   Le script a été exécuté puis éprouvé par un essai à blanc, lui-même annulé par une
   exception volontaire. Résultat relevé mot pour mot dans l'éditeur SQL de Supabase :

       RESULTAT rattachee=1 en_attente=0 colis_remis_avant=2 colis_remis_apres=2

   Ce qu'il dit, dans l'ordre : le déclencheur rattache bien l'annonce à la remise qui lui
   répond ; aucune annonce ne reste en attente après la remise ; et surtout LE NOMBRE DE COLIS
   SOLDÉS N'A PAS BOUGÉ. Une annonce ne solde rien. Après l'essai, la table des annonces
   contenait zéro ligne et la table des remises n'avait pas grossi : la base était exactement
   comme avant.

   CE QUE CE BANC D'ESSAI NE PROUVE PAS
   ------------------------------------
   Tout ce qui suit tourne sous Node, sans navigateur et sans base. Les règles d'accès de
   PostgreSQL ne sont pas rejouées ici ; ce qui en est vérifié, c'est le TEXTE du script, sur
   le poste qui le détient — _sql-prive est hors dépôt. Rien de ce qui suit n'a tourné sur un
   téléphone. Un banc vert ne dit donc pas que le livreur s'en servira ; il dit que ce qui est
   écrit dit ce qu'on croit qu'il dit.

   CE QUE CE BANC D'ESSAI GARDE
   ----------------------------
     1. UNE SEULE RÈGLE DE COMPARAISON. L'écran contre le serveur, l'annonce contre la base :
        deux confrontations, un seul arrondi, écrit une fois.
     2. UNE ANNONCE NE SOLDE RIEN. Ni dans le SQL, ni dans le geste du livreur.
     3. LE LIVREUR N'ANNONCE QUE POUR LUI. La fonction ne reçoit aucun identifiant de livreur.
     4. UN CHAMP VIDE N'EST PAS ZÉRO. Écrire 0 à la place d'un homme qui n'a rien tapé lui
        ferait dire qu'il n'apporte rien.
     5. LE SENS DES MONTANTS NÉGATIFS. Quand CLT doit de l'argent au livreur, on ne l'écrit
        pas comme une dette du livreur.
     6. LE SILENCE QUAND IL N'Y A RIEN À DIRE. Pas d'annonce, pas d'encadré.
     7. LA PAROLE SE LIT AVANT LA SAISIE, pas après.
     8. LA TRACE RESTE. Une correction s'ajoute, elle ne remplace pas.
     9. RIEN NE CASSE SI LA BASE N'A PAS ENCORE LE SCRIPT.
   ========================================================================================== */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const sourceConfig = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const common = fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8');
const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');

const CHEMIN_SQL = path.join(RACINE, '_sql-prive', '2026-08-29-le-livreur-annonce-sa-remise.sql');

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
  'accordDeDeuxMontants', 'accordDuServeurEtDeLEcran',
  'accordAnnonceEtBase', 'heureAnnonceCLT',
  'annoncePourLEquipeHTML', 'monAnnonceHTML', 'mesRemisesHTML',
].map(n => blocDe(sourceConfig, n, 'config.js')).join('\n\n'), contexte);

const {
  accordDeDeuxMontants, accordDuServeurEtDeLEcran, accordAnnonceEtBase,
  heureAnnonceCLT, annoncePourLEquipeHTML, monAnnonceHTML, mesRemisesHTML,
} = contexte;

const configNu = sansCommentaires(sourceConfig);
const livreurNu = sansCommentaires(livreur);
const equipeNu = sansCommentaires(equipe);

/* ============================================================================================
   1. UNE SEULE RÈGLE DE COMPARAISON
   ============================================================================================ */
titre("Une seule règle de comparaison, pour deux confrontations");

verifier("les deux verdicts descendent de la même fonction",
  blocDe(sourceConfig, 'accordDuServeurEtDeLEcran', 'config.js').includes('accordDeDeuxMontants(')
  && blocDe(sourceConfig, 'accordAnnonceEtBase', 'config.js').includes('accordDeDeuxMontants('),
  "deux arrondis écrits séparément finiraient par tolérer deux écarts différents");

verifier("l'arrondi n'est écrit qu'une fois dans tout config.js",
  (configNu.match(/Math\.round\(([a-z]+)\)[\s\S]{0,40}Math\.round\(/g) || []).length <= 1
  && (configNu.match(/const g = Math\.round\(a\)/g) || []).length === 1,
  "la comparaison au franc entier doit vivre à un seul endroit");

verifier("un franc d'écart se voit, dans les deux sens",
  accordAnnonceEtBase(58001, 58000).ecart === 1
  && accordAnnonceEtBase(57999, 58000).ecart === -1
  && accordAnnonceEtBase(58000, 58000).accord === true);

// « Rien » n'est pas « zéro » : la base peut ne rien renvoyer, et un montant absent comparé
// comme un montant nul annoncerait un trou de caisse de la totalité de la somme.
verifier("un montant absent ne devient jamais un écart",
  accordAnnonceEtBase(null, 58000).connu === false
  && accordAnnonceEtBase(58000, null).connu === false
  && accordAnnonceEtBase('', 58000).connu === false
  && accordAnnonceEtBase(undefined, undefined).connu === false);

verifier("le centième de franc d'un numeric PostgreSQL ne déclenche pas d'alerte",
  accordAnnonceEtBase(58000.004, 58000).accord === true,
  "mais un franc entier, si");

/* ============================================================================================
   2. UNE ANNONCE NE SOLDE RIEN
   ============================================================================================ */
titre("Une annonce n'est pas une remise");

if (!fs.existsSync(CHEMIN_SQL)) {
  ignorer("le script SQL de l'annonce",
    "_sql-prive n'est pas dans le dépôt public : ces contrôles ne valent qu'en local");
} else {
  const sql = fs.readFileSync(CHEMIN_SQL, 'utf8');
  const annoncer = corpsSQL(sql, 'annoncer_ma_remise');
  const lecture = corpsSQL(sql, 'annonce_remise_en_cours');
  const enMain = corpsSQL(sql, 'caisse_en_main_du_livreur');
  const rattache = corpsSQL(sql, 'rattacher_annonces_a_la_remise');

  verifier("les quatre fonctions sont dans le fichier",
    annoncer !== null && lecture !== null && enMain !== null && rattache !== null);

  // Lire encaissement_remis est légitime — c'est ainsi qu'on sait ce que le livreur porte
  // encore. L'ÉCRIRE ne l'est pas : ce serait solder les colis, et une annonce ne solde rien.
  // La première version de cette vérification interdisait la colonne tout court et rougissait
  // sur une simple lecture ; elle disait donc quelque chose de faux sur du code juste.
  verifier("annoncer_ma_remise lit les colis mais n'en modifie aucun",
    /encaissement_remis/i.test(annoncer)
    && !/update\s+public\.colis/i.test(annoncer)
    && !/insert\s+into\s+public\.colis/i.test(annoncer)
    && !/set\s+encaissement_remis/i.test(annoncer),
    "mesuré aussi sur la base le 29 août : 2 colis soldés avant l'essai, 2 après");

  verifier("annoncer_ma_remise n'écrit rien dans remises_caisse",
    !/insert\s+into\s+public\.remises_caisse/i.test(annoncer));

  verifier("annoncer_ma_remise ne reçoit AUCUN identifiant de livreur",
    !/p_livreur_id/.test(sql.slice(sql.indexOf('function public.annoncer_ma_remise'),
                                   sql.indexOf('function public.annoncer_ma_remise') + 260))
    && /auth\.uid\(\)/.test(annoncer),
    "une fonction qui accepterait p_livreur_id devrait le vérifier ; celle-ci n'a rien à vérifier");

  verifier("l'annonce est refusée à qui n'est pas livreur",
    /if not public\.is_livreur\(\)/.test(annoncer) && /raise exception/.test(annoncer));

  verifier("un montant absent est refusé, et n'est pas pris pour zéro",
    /p_montant is null/.test(annoncer) && /raise exception/.test(annoncer));

  verifier("le montant de référence est calculé par le SERVEUR, pas reçu du téléphone",
    /montant_porte/.test(annoncer) && /montant_en_main_du_livreur\(c\)/.test(annoncer)
    && !/p_montant_porte/.test(sql),
    "sinon un livreur annoncerait un écart nul en trafiquant sa propre référence");

  verifier("la table des annonces n'a AUCUNE règle d'écriture",
    /drop policy if exists annonces_remise_insert/.test(sql)
    && /drop policy if exists annonces_remise_update/.test(sql)
    && /drop policy if exists annonces_remise_delete/.test(sql)
    && !/create policy annonces_remise_(insert|update|delete)/.test(sql),
    "une annonce ne se modifie pas et ne s'efface pas : c'est ce qui en fait une trace");

  verifier("le livreur ne lit que SES annonces et SES remises",
    /livreur_id = auth\.uid\(\)/.test(sql)
    && (sql.match(/is_livreur\(\) and livreur_id = auth\.uid\(\)/g) || []).length >= 2);

  verifier("le rattachement passe par un déclencheur, sans rouvrir la fonction de la caisse",
    /create trigger remises_caisse_rattache_annonces/.test(sql)
    && !/create or replace function public\.enregistrer_remise_caisse/.test(sql),
    "cette fonction-là compte de l'argent : on ne la rouvre pas pour une écriture annexe");

  verifier("le déclencheur ne remplit que les annonces encore en attente",
    /set remise_id = new\.id/.test(rattache) && /and remise_id is null/.test(rattache),
    "sinon une remise du soir réécrirait les annonces de toute la semaine");

  verifier("la lecture des remises reste fermée en écriture",
    /create policy remises_caisse_select/.test(sql)
    && !/create policy remises_caisse_(insert|update|delete)/.test(sql));
}

verifier("le téléphone du livreur n'appelle que la fonction d'annonce",
  /rpc\('annoncer_ma_remise'/.test(livreurNu)
  && !/rpc\('enregistrer_remise_caisse'/.test(livreurNu),
  "le pouvoir de solder reste au bureau, exactement comme avant");

verifier("l'écran équipe reste le seul à enregistrer la remise",
  /rpc\('enregistrer_remise_caisse'/.test(equipeNu));

/* ============================================================================================
   3. UN CHAMP VIDE N'EST PAS ZÉRO
   ============================================================================================ */
titre("Un champ vide n'est pas zéro");

const envoi = sansCommentaires(blocDe(livreur, 'envoyerMonAnnonce', 'livreur.html'));
verifier("un champ laissé vide n'envoie rien",
  /brut === ''/.test(envoi) && /Number\.isFinite\(montant\)/.test(envoi) && /return;/.test(envoi),
  "écrire 0 à la place d'un homme qui n'a rien tapé lui ferait dire qu'il n'apporte rien");

verifier("le montant part en francs entiers",
  /Math\.round\(montant\)/.test(envoi));

verifier("un double appui n'envoie pas deux annonces",
  /annonceEnCoursDEnvoi/.test(envoi) && /if \(annonceEnCoursDEnvoi\) return;/.test(envoi));

verifier("après l'envoi, l'écran RELIT la base au lieu de deviner",
  /chargerAnnonceEtRemises\(\)/.test(envoi) && !/monAnnonceEnCours = \{/.test(envoi),
  "une annonce affichée sans avoir été relue serait une promesse, pas une trace");

/* ============================================================================================
   4. LE SENS DES MONTANTS, ET LE SILENCE QUAND IL N'Y A RIEN À DIRE
   ============================================================================================ */
titre("Le sens des montants, et le silence quand il n'y a rien à dire");

verifier("aucune annonce : aucun encadré, ni pour l'équipe ni pour le livreur",
  annoncePourLEquipeHTML(null) === '' && monAnnonceHTML(null) === ''
  && annoncePourLEquipeHTML({ montant_annonce: null }) === '',
  "beaucoup de soirs se passeront comme ça, et la fenêtre doit rester celle d'avant");

/* Les montants attendus sont fabriqués par formatMontant, jamais écrits à la main. Écrire
   « 58 000 FCFA » dans ce fichier semblait juste et ne l'était pas : formatMontant sépare ses
   milliers par une espace fine insécable (U+202F), pas par l'espace de la barre d'espace. Cinq
   vérifications sont nées rouges pour cette seule raison, sur du code parfaitement correct.
   Une valeur attendue recopiée à la main est une seconde version de la règle. */
const fcfa = n => contexte.formatMontant(n);

const jour = '2026-08-29T19:12:00';
const simple = { montant_annonce: 58000, montant_porte: 58000, note: null,
                 annonce_le: jour, nb_annonces: 1 };

verifier("l'annonce porte son montant et son heure",
  annoncePourLEquipeHTML(simple, jour).includes(fcfa(58000))
  && annoncePourLEquipeHTML(simple, jour).includes('19 h 12'));

verifier("une annonce d'accord avec la base ne déclenche aucun avertissement",
  !annoncePourLEquipeHTML(simple, jour).includes('de moins')
  && !annoncePourLEquipeHTML(simple, jour).includes('de plus'),
  "un avertissement à chaque remise deviendrait un décor qu'on cesserait de lire");

const manque = Object.assign({}, simple, { montant_annonce: 53000 });
verifier("un livreur qui annonce moins que ce qu'il porte est signalé, avec les trois chiffres",
  annoncePourLEquipeHTML(manque, jour).includes(fcfa(53000))
  && annoncePourLEquipeHTML(manque, jour).includes(fcfa(58000))
  && annoncePourLEquipeHTML(manque, jour).includes(fcfa(5000))
  && annoncePourLEquipeHTML(manque, jour).includes('de moins'));

verifier("et on demande pourquoi AVANT de compter, pas après",
  annoncePourLEquipeHTML(manque, jour).includes('avant de compter'));

const negatif = Object.assign({}, simple, { montant_annonce: -12000, montant_porte: -12000 });
verifier("quand CLT doit de l'argent au livreur, ce n'est pas écrit comme une dette du livreur",
  annoncePourLEquipeHTML(negatif, jour).includes('CLT lui doit')
  && monAnnonceHTML(negatif, jour).includes('CLT vous doit')
  && !annoncePourLEquipeHTML(negatif, jour).includes('-12')
  && !annoncePourLEquipeHTML(negatif, jour).includes('−12'));

const repris = Object.assign({}, simple, { nb_annonces: 3 });
verifier("le bureau sait que le livreur s'est repris, et combien de fois",
  annoncePourLEquipeHTML(repris, jour).includes('3 annonces')
  && !annoncePourLEquipeHTML(simple, jour).includes('repris'),
  "« il s'est repris deux fois » est une information, pas un reproche");

verifier("la note du livreur est reprise telle qu'il l'a écrite",
  annoncePourLEquipeHTML(Object.assign({}, simple, { note: 'il manque 5 000, réglés demain' }), jour)
    .includes('il manque 5 000, réglés demain'));

verifier("une note ne peut pas injecter de code dans l'écran du bureau",
  !annoncePourLEquipeHTML(Object.assign({}, simple, { note: '<img src=x onerror=alert(1)>' }), jour)
    .includes('<img src=x'),
  "la note vient d'un autre compte que celui qui la lit");

/* ============================================================================================
   5. L'HEURE, DITE COMME ON LA DIT
   ============================================================================================ */
titre("L'heure, dite comme on la dit");

verifier("le soir même, l'heure suffit",
  heureAnnonceCLT('2026-08-29T19:12:00', '2026-08-29T21:00:00') === 'à 19 h 12');

verifier("le lendemain matin, la date apparaît",
  heureAnnonceCLT('2026-08-28T19:12:00', '2026-08-29T08:00:00') === 'le 28/08 à 19 h 12',
  "c'est ce matin-là qu'il faut la voir, sans avoir à la déduire");

verifier("une date illisible ne fait pas tomber l'écran",
  heureAnnonceCLT('n\'importe quoi') === '' && heureAnnonceCLT(null) === '');

/* ============================================================================================
   6. LA PAROLE SE LIT AVANT LA SAISIE
   ============================================================================================ */
titre("La parole du livreur se lit avant la saisie du bureau");

const posAnnonce = equipe.indexOf('id="remise-modal-annonce"');
const posRecu = equipe.indexOf('id="remise-modal-recu"');
const posAttendu = equipe.indexOf('id="remise-modal-attendu"');
verifier("l'annonce est placée entre le montant attendu et le champ de saisie",
  posAnnonce > posAttendu && posAnnonce < posRecu && posAttendu !== -1 && posRecu !== -1,
  "sinon l'annonce ne servirait qu'à commenter une somme déjà décidée");

verifier("la fenêtre demande l'annonce à l'ouverture, sans attendre la saisie",
  /demanderLAnnonceDuLivreur\(__remiseCtx\)/.test(equipeNu)
  && blocDe(equipe, 'showRemiseModal', 'equipe.html').includes('demanderLAnnonceDuLivreur'));

const demande = sansCommentaires(blocDe(equipe, 'demanderLAnnonceDuLivreur', 'equipe.html'));
verifier("une base muette n'empêche pas d'enregistrer la remise",
  /if \(error\) return;/.test(demande) && /catch \(e\) \{ return; \}/.test(demande),
  "le bureau doit pouvoir solder un soir où le réseau d'Abidjan ne répond pas");

verifier("l'annonce d'un livreur ne reste pas affichée devant le nom d'un autre",
  sansCommentaires(blocDe(equipe, 'hideRemiseModal', 'equipe.html'))
    .includes("getElementById('remise-modal-annonce')"));

verifier("la fenêtre vérifie qu'elle parle encore du même livreur au retour du réseau",
  /__remiseCtx !== ctx/.test(demande));

/* ============================================================================================
   7. CE QUE LE LIVREUR VOIT, ET CE QU'IL PEUT REFAIRE
   ============================================================================================ */
titre("Ce que le livreur voit, et ce qu'il peut refaire");

const rendu = sansCommentaires(blocDe(livreur, 'renderAnnonceRemise', 'livreur.html'));

verifier("le montant proposé sort de la même addition que « Ce que vous portez »",
  /caisseEnMainDuLivreur\(allColis, currentUser\.id\)/.test(rendu),
  "une seconde addition finirait par proposer un autre chiffre que celui affiché juste au-dessus");

verifier("sur un historique partiel, aucun montant n'est proposé",
  /colisHasMore \? '' :/.test(rendu),
  "mieux vaut pas de chiffre qu'un chiffre trop bas, comme pour le bloc du dessus");

verifier("après une annonce, le livreur peut se corriger",
  /Corriger mon annonce/.test(livreur) && /formulaireAnnonceHTML\(dejaDit/.test(rendu),
  "une faute de frappe qu'on ne peut plus corriger devient une accusation");

verifier("le champ de correction est pré-rempli avec ce qu'il avait dit",
  /const dejaDit = Math\.round\(Number\(monAnnonceEnCours\.montant_annonce\)/.test(rendu));

verifier("l'écran dit au livreur que l'ancienne annonce reste",
  monAnnonceHTML(simple, jour).includes("l'ancienne annonce reste"));

verifier("si la base n'a pas encore le script, l'écran le dit et ne casse rien",
  /annonceIndisponible/.test(rendu)
  && /pas encore activée/.test(rendu)
  && /continuer à/.test(rendu),
  "une application qui casse parce qu'une nouveauté n'est pas déployée est pire que celle d'avant");

/* Le filtre doit être lu DANS la fonction qui charge l'historique, pas n'importe où dans la
   page. Écrite d'abord sur le fichier entier, cette vérification restait verte quand on retirait
   le filtre : la même chaîne existe deux fois ailleurs dans livreur.html, sur les colis et sur
   les positions. Un sabotage l'a montré. C'est une leçon générale : chercher un motif dans un
   fichier de cent soixante mille caractères, c'est presque toujours le trouver. */
const chargement = sansCommentaires(blocDe(livreur, 'chargerAnnonceEtRemises', 'livreur.html'));
/* Deux corrections nées d'un regard, pas d'un banc d'essai. Publiées le 29 août, elles ont été
   ouvertes dans un navigateur le 30 : le pictogramme 🗣️ sortait en gris-bleu terne, comme une
   tache d'impression, quand tous les autres de l'application sont en couleur ; et le champ de
   saisie affichait « 58000 » d'un bloc, alors que l'application écrit partout « 58 000 FCFA ».
   Aucune des 55 vérifications d'alors ne pouvait les voir : elles lisent du code, elles ne
   regardent pas un écran. Ce qui suit ne remplace pas le regard — il empêche seulement ces
   deux-là de revenir. */
const clair = sansCommentaires(blocDe(livreur, 'annonceMontantClair', 'livreur.html'));

verifier("la somme est relue en clair sous le champ, par formatMontant",
  /formatMontant\(Math\.round\(n\)\)/.test(clair)
  && /annonceMontantClair\(montant\)/.test(livreurNu),
  "un champ de type nombre ne sait pas espacer ses milliers ; le livreur lisait « 58000 »");

verifier("la relecture suit chaque frappe",
  /addEventListener\('input'/.test(sansCommentaires(blocDe(livreur, 'brancherFormulaireAnnonce', 'livreur.html'))));

verifier("un champ vide ne dit pas « 0 FCFA »",
  /if \(brut === ''\) return '';/.test(clair),
  "tant qu'il n'a pas tapé, personne ne doit lui faire dire qu'il n'apporte rien");

verifier("un montant négatif se relit comme une dette de CLT, pas du livreur",
  /que CLT vous doit/.test(clair) && /Math\.abs\(Math\.round\(n\)\)/.test(clair));

verifier("le pictogramme terne a disparu des deux encadrés",
  !livreur.includes('🗣') && !sourceConfig.includes('🗣'),
  "vu à l'écran le 30 août 2026 : il ressortait en gris-bleu, presque illisible à 13 pixels");

verifier("l'historique du livreur ne demande QUE ses propres remises",
  /\.from\('remises_caisse'\)/.test(chargement)
  && /\.eq\('livreur_id', currentUser\.id\)/.test(chargement));

verifier("l'annonce lue est bien celle du livreur connecté",
  /p_livreur_id: currentUser\.id/.test(chargement));

verifier("ni l'annonce ni l'historique ne font tomber l'écran quand la base se tait",
  (chargement.match(/catch \(e\)/g) || []).length >= 2 && /annonceIndisponible = true/.test(chargement),
  "ces deux appels sont les premiers que cette page adresse à une fonction serveur");

/* ============================================================================================
   8. L'HISTORIQUE DIT L'ÉCART SANS LE COMMENTER
   ============================================================================================ */
titre("L'historique dit l'écart sans le commenter");

verifier("aucune remise : une phrase, pas un tableau vide",
  mesRemisesHTML([]).includes('Aucune remise') && mesRemisesHTML(null).includes('Aucune remise'));

const hist = [
  { created_at: '2026-08-28T20:00:00', montant_remis: 58000, ecart: 0, nb_colis: 4 },
  { created_at: '2026-08-27T20:00:00', montant_remis: 53000, ecart: -5000, nb_colis: 3 },
  { created_at: '2026-08-26T20:00:00', montant_remis: 61000, ecart: 2000, nb_colis: 5 },
];
const rendus = mesRemisesHTML(hist);
verifier("une remise juste se dit « juste », sans félicitations",
  rendus.includes('juste') && !rendus.includes('Bravo') && !rendus.includes('✅'));

verifier("un manque se dit « manque », avec son montant",
  rendus.includes('manque ' + fcfa(5000)));

verifier("un trop-perçu se dit « en trop », et pas « manque »",
  rendus.includes(fcfa(2000) + ' en trop'));

verifier("chaque ligne porte sa date et son nombre de colis",
  rendus.includes('28/08/2026') && rendus.includes('4 colis soldés')
  && rendus.includes('3 colis soldés'));

verifier("l'écart affiché est celui archivé, sans être recalculé sur place",
  !sansCommentaires(blocDe(sourceConfig, 'mesRemisesHTML', 'config.js'))
    .includes('montant_remis) - Number(r.montant_attendu'),
  "c'est la base qui a calculé cet écart au moment de la remise ; le relire autrement serait "
  + "en inventer un second");

/* ============================================================================================ */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`
  + (ignorees ? `, ${ignorees} ignorées` : ''));
if (echouees) process.exit(1);
