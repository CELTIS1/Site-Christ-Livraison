/* Banc d'essai de la saisie en lot à partir des photos d'étiquettes.
   ------------------------------------------------------------------------------------------
   À quoi ça sert, en clair : la vendeuse colle une étiquette manuscrite sur chaque colis, le
   livreur photographie chaque colis et dépose tout dans le groupe WhatsApp. Avant, un membre de
   l'équipe ouvrait les images UNE PAR UNE et retapait tout. Dix colis = dix allers-retours. À
   cent, deux cents, mille, ce n'est plus tenable.

   Ce qui coûte n'est pas la frappe, c'est l'aller-retour. L'écran en lot le supprime : on verse
   toutes les photos d'un coup, chaque photo s'affiche à côté de son formulaire.

   Ce banc d'essai vérifie les quatre garde-fous, les mêmes que pour « Coller la commande » :

     1. ON NE REMPLIT JAMAIS PAR-DESSUS UN HUMAIN. Le carnet ne complète que les champs vides.
     2. DEUX RÉPONSES POSSIBLES = AUCUNE RÉPONSE. Un numéro incomplet ne déclenche aucune
        recherche : mieux vaut ne rien proposer qu'un mauvais destinataire.
     3. UNE LIGNE VIDE N'EST PAS UN COLIS. Une photo pour laquelle personne n'a rien saisi est
        un oubli. On le signale au lieu de créer un colis fantôme.
     4. SOIT LE LOT PART ENTIER, SOIT RIEN NE PART. À mi-parcours, la moitié des colis serait en
        base et l'autre non, sans que personne sache laquelle.

   Une place particulière est faite aux MESSAGES. Sur cent colis, « corrigez les erreurs »
   oblige à tout relire ; « colis 3 et 7 » dit où aller. Un compte rendu qui ment sur une photo
   perdue ou sur un colis resté en attente est pire que pas de compte rendu du tout.

   Comment : on extrait le VRAI code depuis app/config.js (pas une copie, qui finirait par
   diverger en silence) et on l'exécute.

   Lancer à la main :  node tests/saisie-en-lot.test.mjs
   Renvoie un code d'erreur si une vérification échoue. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { controlerEtiquettesDeVersion } from './etiquettes-de-version.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');

/* ---------- Extraction du vrai code ---------- */
const source = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const contexte = vm.createContext({ console });

function blocDe(src, nom){
  const debut = src.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  console.error(`Fin de ${nom} introuvable`); process.exit(1);
}
const bloc = (nom) => blocDe(source, nom);

vm.runInContext([
  bloc('isValidMontant'),
  bloc('cleTelCarnet'),
  bloc('cleTexteCarnet'),
  bloc('construireCarnet'),
  bloc('appliquerEntreeCarnet'),
  bloc('numeroIvoirien'),
  bloc('entreeCarnetParTelephone'),
  bloc('ligneLotEstVide'),
  bloc('verifierLotAvantEnvoi'),
  bloc('resumeProblemesLotTexte'),
  bloc('resumeEnvoiLotTexte'),
].join('\n\n'), contexte);

const { construireCarnet, appliquerEntreeCarnet, entreeCarnetParTelephone,
        ligneLotEstVide, verifierLotAvantEnvoi,
        resumeProblemesLotTexte, resumeEnvoiLotTexte } = contexte;

/* ---------- Petit échafaudage de vérification ---------- */
let reussies = 0, echouees = 0;
function verifier(titreVerif, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + titreVerif); }
  else { echouees++; console.log('  ❌ ' + titreVerif + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

// Une ligne du lot telle que l'écran la lit dans le formulaire.
function ligne(champs){
  return Object.assign({
    destination: '', telephone: '', montantArticle: '', montantLivraison: '', description: ''
  }, champs || {});
}

// L'historique des colis de cette cliente, tel que la base le renvoie.
const HISTORIQUE = [
  { destinataire_telephone: '0701020304', commune_destination: 'Cocody',   destination: 'Angré 8e tranche',      created_at: '2026-08-10T10:00:00Z' },
  { destinataire_telephone: '0555667788', commune_destination: 'Yopougon', destination: 'Niangon Sud',           created_at: '2026-08-05T10:00:00Z' },
  { destinataire_telephone: '0102030405', commune_destination: 'Marcory',  destination: 'Zone 4 rue du commerce', created_at: '2026-07-20T10:00:00Z' },
];
const CARNET = construireCarnet(HISTORIQUE);

/* ==========================================================================================
   1. Le carnet ne parle que lorsqu'il est sûr
   ========================================================================================== */
titre('Le carnet ne répond que sur un numéro COMPLET');
{
  const trouve = entreeCarnetParTelephone(CARNET, '0701020304');
  verifier('un numéro complet et connu est retrouvé',
    !!trouve && trouve.commune === 'Cocody' && trouve.destination === 'Angré 8e tranche',
    JSON.stringify(trouve));

  verifier('les mêmes chiffres avec des espaces donnent le même destinataire',
    (entreeCarnetParTelephone(CARNET, '07 01 02 03 04') || {}).commune === 'Cocody');
  verifier('les mêmes chiffres avec des tirets donnent le même destinataire',
    (entreeCarnetParTelephone(CARNET, '07-01-02-03-04') || {}).commune === 'Cocody');
  verifier("l'indicatif 225 devant ne change rien",
    (entreeCarnetParTelephone(CARNET, '+225 07 01 02 03 04') || {}).commune === 'Cocody');

  // Le cœur du garde-fou 2 : pendant la frappe, « 0701 » correspond à plusieurs destinataires.
  // Proposer le premier venu écrirait une adresse fausse que personne ne relirait.
  ['0', '07', '0701', '070102030', ''].forEach(partiel => {
    verifier(`un numéro partiel (« ${partiel || 'vide'} ») ne propose RIEN`,
      entreeCarnetParTelephone(CARNET, partiel) === null);
  });

  verifier('un numéro complet mais inconnu ne propose rien',
    entreeCarnetParTelephone(CARNET, '0788889999') === null);
  verifier('onze chiffres ne sont pas un numéro ivoirien',
    entreeCarnetParTelephone(CARNET, '07010203040') === null);
  verifier("un numéro qui ne commence pas par un préfixe ivoirien ne propose rien",
    entreeCarnetParTelephone(CARNET, '0901020304') === null);
  verifier('un carnet vide ne fait pas tomber la recherche',
    entreeCarnetParTelephone([], '0701020304') === null
    && entreeCarnetParTelephone(null, '0701020304') === null);

  // Un « commence par » attraperait le mauvais destinataire dès que deux numéros se ressemblent.
  const carnetProches = construireCarnet([
    { destinataire_telephone: '0701020304', commune_destination: 'Cocody',  destination: 'Angré', created_at: '2026-08-10T10:00:00Z' },
    { destinataire_telephone: '0701020305', commune_destination: 'Abobo',   destination: 'Gare',  created_at: '2026-08-11T10:00:00Z' },
  ]);
  verifier('deux numéros voisins ne sont pas confondus',
    (entreeCarnetParTelephone(carnetProches, '0701020305') || {}).commune === 'Abobo');
}

titre('Le carnet ne remplit jamais par-dessus une saisie humaine');
{
  const entree = { commune: '', destination: 'Cocody — Angré 8e tranche', telephone: '' };

  const surVide = appliquerEntreeCarnet(entree, { destination: '', telephone: '' });
  verifier('un champ vide est rempli',
    surVide.ecrits.destination === 'Cocody — Angré 8e tranche' && surVide.conserves.length === 0);

  const surSaisi = appliquerEntreeCarnet(entree, { destination: 'Bingerville', telephone: '' });
  verifier("une destination déjà tapée n'est PAS remplacée",
    !('destination' in surSaisi.ecrits) && surSaisi.conserves.length === 1,
    JSON.stringify(surSaisi));

  // Même lieu écrit autrement : ce n'est pas un conflit, donc pas d'avertissement inutile.
  const memeLieu = appliquerEntreeCarnet(
    { commune: '', destination: 'Cocody — Angré', telephone: '' },
    { destination: 'cocody  angre', telephone: '' });
  verifier('le même lieu écrit autrement ne déclenche pas de faux conflit',
    !('destination' in memeLieu.ecrits) && memeLieu.conserves.length === 0,
    JSON.stringify(memeLieu));
}

/* ==========================================================================================
   2. Une photo sans saisie n'est pas un colis
   ========================================================================================== */
titre('Une ligne où rien n\u2019a été saisi est reconnue comme vide');
{
  verifier('une ligne entièrement vide est vide', ligneLotEstVide(ligne({})) === true);
  verifier('des espaces seuls ne comptent pas pour une saisie',
    ligneLotEstVide(ligne({ destination: '   ', description: '  ' })) === true);
  verifier('une ligne absente ou nulle est traitée comme vide',
    ligneLotEstVide(null) === true && ligneLotEstVide(undefined) === true);

  // Un seul champ suffit à faire exister le colis : l'équipe saisit parfois juste un montant en
  // attendant de relire l'étiquette. Ce n'est pas à la machine de décider que c'est incomplet.
  [['destination','Cocody'], ['telephone','0701020304'], ['montantArticle','5000'],
   ['montantLivraison','1500'], ['description','Carton']].forEach(([champ, valeur]) => {
    verifier(`un seul champ rempli (${champ}) suffit à faire exister le colis`,
      ligneLotEstVide(ligne({ [champ]: valeur })) === false);
  });

  // Le point important : la photo est la SOURCE de la saisie, pas la saisie. Une ligne où l'on
  // n'a rien tapé signifie qu'on a sauté cette photo.
  verifier('une photo seule, sans rien de saisi, reste une ligne vide',
    ligneLotEstVide(ligne({})) === true);
}

/* ==========================================================================================
   3. Le lot est contrôlé ENTIÈREMENT avant le moindre envoi
   ========================================================================================== */
titre('Le contrôle du lot laisse passer ce qui est correct');
{
  const lot = [
    ligne({ destination: 'Cocody', telephone: '0701020304', montantArticle: '15000', montantLivraison: '1500' }),
    ligne({ destination: 'Yopougon', montantArticle: '6000' }),
    ligne({ telephone: '0555667788', description: 'Carton de pagnes' }),
  ];
  const res = verifierLotAvantEnvoi(lot);
  verifier('trois lignes correctes passent toutes', res.pretes.length === 3 && res.problemes.length === 0,
    JSON.stringify(res.problemes));

  verifier('un lot vide ne pose aucun problème et ne prépare rien',
    verifierLotAvantEnvoi([]).pretes.length === 0 && verifierLotAvantEnvoi([]).problemes.length === 0);
  verifier('un lot absent ne fait pas tomber le contrôle',
    verifierLotAvantEnvoi(null).problemes.length === 0);
}

titre('Le contrôle du lot attrape ce qui est faux, et dit OÙ');
{
  const lot = [
    ligne({ destination: 'Cocody', telephone: '0701020304', montantArticle: '15000' }),  // 1 : correct
    ligne({}),                                                                            // 2 : vide
    ligne({ destination: 'Abobo', telephone: '070102' }),                                 // 3 : téléphone court
    ligne({ destination: 'Marcory', montantArticle: '-500' }),                            // 4 : montant négatif
    ligne({ destination: 'Treichville', montantLivraison: 'abc' }),                       // 5 : montant illisible
  ];
  const res = verifierLotAvantEnvoi(lot);

  verifier('les quatre lignes fautives sont signalées', res.problemes.length === 4,
    JSON.stringify(res.problemes));
  verifier('la seule ligne correcte est bien la seule préparée', res.pretes.length === 1);
  verifier('les rangs signalés sont ceux qui s\u2019affichent à l\u2019écran (2, 3, 4, 5)',
    res.problemes.map(p => p.rang).join(',') === '2,3,4,5',
    res.problemes.map(p => p.rang).join(','));
  verifier('la ligne vide est nommée comme telle',
    /rien n\u2019a été saisi|rien n'a été saisi/.test(res.problemes[0].motif), res.problemes[0].motif);
  verifier('le téléphone incomplet est nommé comme tel',
    /num[ée]ro/i.test(res.problemes[1].motif), res.problemes[1].motif);
  verifier('les montants invalides sont nommés comme tels',
    /montants/i.test(res.problemes[2].motif) && /montants/i.test(res.problemes[3].motif));

  // Garde-fou 4 : le rang d'une ligne fautive ne doit PAS dépendre du nombre de lignes correctes
  // qui la précèdent, sinon le message enverrait relire la mauvaise photo.
  const lotDecale = [ligne({ destination: 'A' }), ligne({ destination: 'B' }), ligne({})];
  verifier('le rang tient compte des lignes correctes qui précèdent',
    verifierLotAvantEnvoi(lotDecale).problemes[0].rang === 3);
}

titre('Un colis sans description passe (elle est facultative depuis le 21 août 2026)');
{
  // La description n'est écrite sur AUCUNE étiquette. L'exiger obligeait l'équipe à inventer un
  // texte pour chaque colis, cent fois par jour, sans que personne ne le lise ensuite.
  const res = verifierLotAvantEnvoi([
    ligne({ destination: 'Cocody', telephone: '0701020304', montantArticle: '15000' })
  ]);
  verifier('la description absente ne bloque rien', res.pretes.length === 1 && res.problemes.length === 0,
    JSON.stringify(res.problemes));
}

titre('Un montant à zéro est un vrai montant, pas un champ vide');
{
  // Une livraison offerte s'écrit « 0 ». La confondre avec un champ vide ferait disparaître
  // l'information et fausserait la comptabilité.
  const res = verifierLotAvantEnvoi([ligne({ destination: 'Cocody', montantLivraison: '0' })]);
  verifier('« 0 » est accepté comme montant', res.pretes.length === 1 && res.problemes.length === 0,
    JSON.stringify(res.problemes));
  verifier('une ligne dont le seul contenu est « 0 » n\u2019est pas considérée comme vide',
    ligneLotEstVide(ligne({ montantLivraison: '0' })) === false);
}

titre('Le code de confirmation ne doit plus rien contrôler nulle part');
{
  // Il y avait ici cinq contrôles sur le code à quatre chiffres. Ils ont été remplacés par
  // celui-ci le 21 août 2026, quand le code a été retiré de toute l'application. Le supprimer
  // sans rien mettre à la place aurait été la mauvaise façon de faire : personne n'aurait
  // remarqué le jour où un chemin de saisie se remet à envoyer un `codeConfirmation`, et l'on
  // retomberait dans la panne d'origine — un livreur bloqué devant une porte, face à quelqu'un
  // qui n'a jamais reçu de code. On vérifie donc l'inverse de ce qu'on vérifiait : un code posé
  // sur une ligne ne change plus RIEN à la décision, quelle que soit sa forme.
  for (const valeur of ['', '4821', '482', '48A1', 'nimportequoi']) {
    const res = verifierLotAvantEnvoi([ligne({ destination: 'Cocody', codeConfirmation: valeur })]);
    verifier(`un « code » de la forme « ${valeur || '(vide)'} » n\u2019influe plus sur le contrôle`,
      res.pretes.length === 1 && res.problemes.length === 0, JSON.stringify(res.problemes));
  }
  // Et la fonction elle-même ne doit plus contenir la règle : la lire dans la source évite qu'on
  // la remette silencieusement en place « au cas où », derrière une option qui traînerait.
  verifier('la règle des 4 chiffres a bien disparu de la source du contrôle',
    !/codeConfirmation/.test(bloc('verifierLotAvantEnvoi')));
}

titre('Le numéro du destinataire est exigé quand l\u2019écran le demande');
{
  // Rendu obligatoire des deux côtés le 21 août 2026, sur la seule justification qui tienne :
  // un colis sans numéro ne se livre pas. Le livreur arrive dans la commune, ne trouve pas la
  // porte, et n'a personne à appeler. C'est la seule colonne dont l'absence rend le colis
  // intraitable — d'où le fait qu'elle soit la seule à être exigée partout.
  const sansTel = [ligne({ communeDestination: 'Cocody', destination: 'Angré', montantArticle: '9000' })];
  verifier('sans option, une ligne sans numéro passe encore (reprise d\u2019anciens colis, import)',
    verifierLotAvantEnvoi(sansTel).pretes.length === 1);
  const refus = verifierLotAvantEnvoi(sansTel, { telephoneObligatoire: true });
  verifier('avec l\u2019option, la ligne sans numéro est refusée',
    refus.pretes.length === 0 && refus.problemes.length === 1);
  verifier('et le motif nomme ce qui manque',
    /numéro du destinataire/.test(refus.problemes[0].motif), refus.problemes[0].motif);
  verifier('un numéro ivoirien complet lève le refus',
    verifierLotAvantEnvoi([ligne({ destination: 'Angré', telephone: '07 01 02 03 04' })],
      { telephoneObligatoire: true }).pretes.length === 1);

  // Un numéro PRÉSENT mais incomplet ne doit pas être confondu avec un numéro absent : les deux
  // motifs envoient la personne faire deux gestes différents, taper le numéro ou le corriger.
  const tronque = verifierLotAvantEnvoi([ligne({ destination: 'Angré', telephone: '07 01 02' })],
    { telephoneObligatoire: true });
  verifier('un numéro incomplet est refusé pour sa forme, pas pour son absence',
    /10 chiffres/.test(tronque.problemes[0].motif), tronque.problemes[0].motif);

  // Priorité de la ligne vide, ici aussi : une photo pour laquelle personne n'a rien saisi est un
  // oubli. Lui répondre « il manque le numéro » enverrait relire une ligne où il n'y a rien.
  const vide = verifierLotAvantEnvoi([ligne({})], { telephoneObligatoire: true });
  verifier('une ligne entièrement vide reste signalée comme vide, pas comme sans numéro',
    /rien n['\u2019]a été saisi/.test(vide.problemes[0].motif), vide.problemes[0].motif);
}

titre('Les exigences propres à chaque espace passent par une option, pas par un second contrôle');
{
  // Côté vendeuse, la commune de destination décide du tarif et de la tournée : un colis sans
  // commune ne peut être affecté à personne. Côté équipe, la destination est écrite sur l'étiquette
  // et la commune se déduit plus tard, donc l'exiger bloquerait une saisie parfaitement valable.
  // Cette différence est UNE OPTION sur la même fonction, et non un second contrôle écrit à part :
  // un contrôle jumeau aurait fini par diverger, et c'est toujours celui qu'on oublie de corriger
  // qui repart en production.
  const sansCommune = [ligne({ destination: 'Angré 8e tranche', montantArticle: '15000' })];
  verifier('sans option, une ligne sans commune passe (c\u2019est le cas de l\u2019équipe)',
    verifierLotAvantEnvoi(sansCommune).pretes.length === 1);
  const refus = verifierLotAvantEnvoi(sansCommune, { communeObligatoire: true });
  verifier('avec l\u2019option, la même ligne est refusée (c\u2019est le cas de la vendeuse)',
    refus.pretes.length === 0 && refus.problemes.length === 1);
  verifier('et le motif nomme ce qui manque',
    /commune/.test(refus.problemes[0].motif), refus.problemes[0].motif);
  verifier('la commune renseignée lève le refus',
    verifierLotAvantEnvoi([ligne({ communeDestination: 'Cocody', destination: 'Angré' })],
      { communeObligatoire: true }).pretes.length === 1);

  // Même mécanique pour le destinataire, prévue pour le jour où un espace l'exigera.
  const sansDest = [ligne({ communeDestination: 'Cocody', montantArticle: '9000' })];
  verifier('sans option, une ligne sans destinataire passe', verifierLotAvantEnvoi(sansDest).pretes.length === 1);
  verifier('avec l\u2019option, elle est refusée',
    verifierLotAvantEnvoi(sansDest, { destinataireObligatoire: true }).problemes.length === 1);

  // Garde-fou 3, qui doit garder la priorité : une photo pour laquelle personne n'a rien saisi est
  // un oubli, et on doit le dire ainsi. Lui répondre « il manque la commune » enverrait relire une
  // ligne où il n'y a rien à relire.
  const vide = verifierLotAvantEnvoi([ligne({})], { communeObligatoire: true });
  verifier('une ligne entièrement vide est signalée comme vide, pas comme incomplète',
    /rien n['\u2019]a été saisi/.test(vide.problemes[0].motif), vide.problemes[0].motif);
}

/* ==========================================================================================
   4. Les messages : ils doivent dire OÙ regarder, et ne jamais mentir
   ========================================================================================== */
titre('Le message de refus nomme les colis concernés');
{
  verifier('aucun problème → aucun message', resumeProblemesLotTexte([]) === ''
    && resumeProblemesLotTexte(null) === '');

  const un = resumeProblemesLotTexte([{ rang: 3, motif: 'rien n\u2019a été saisi pour cette photo' }]);
  verifier('un seul problème : le message nomme le colis 3', /Colis 3/.test(un), un);

  const plusieurs = resumeProblemesLotTexte([
    { rang: 2, motif: 'motif A' }, { rang: 7, motif: 'motif B' }
  ]);
  verifier('plusieurs problèmes : les deux rangs sont cités',
    /colis 2/.test(plusieurs) && /colis 7/.test(plusieurs), plusieurs);
  verifier('plusieurs problèmes : le message dit clairement que RIEN n\u2019a été enregistré',
    /Rien n\u2019a été enregistré|Rien n'a été enregistré/.test(plusieurs), plusieurs);
  verifier('les motifs sont conservés, pas résumés en « erreur »',
    /motif A/.test(plusieurs) && /motif B/.test(plusieurs), plusieurs);
}

titre('Le compte rendu après envoi dit la vérité, y compris quand elle est partielle');
{
  verifier('rien d\u2019envoyé → on le dit franchement',
    resumeEnvoiLotTexte({}) === "Aucun colis n'a été enregistré."
    && resumeEnvoiLotTexte(null) === "Aucun colis n'a été enregistré.");

  verifier('un seul colis : la phrase est au singulier',
    /^1 colis enregistré\./.test(resumeEnvoiLotTexte({ crees: 1 })),
    resumeEnvoiLotTexte({ crees: 1 }));
  verifier('dix colis : la phrase est au pluriel',
    /^10 colis enregistrés\./.test(resumeEnvoiLotTexte({ crees: 10 })),
    resumeEnvoiLotTexte({ crees: 10 }));

  const avecDeja = resumeEnvoiLotTexte({ crees: 8, dejaEnregistres: 2 });
  verifier('les colis déjà en base sont comptés à part, pas cachés',
    /8 colis enregistrés/.test(avecDeja) && /2 étaient déjà enregistrés/.test(avecDeja), avecDeja);

  // Le point le plus important de ce message : croire qu'on a une preuve en base alors qu'il
  // n'y en a pas, c'est découvrir le problème le jour du litige.
  const photoPerdue = resumeEnvoiLotTexte({ crees: 5, photosPerdues: 1 });
  verifier('une photo perdue est signalée, et on précise que le colis existe quand même',
    /Attention/.test(photoPerdue) && /1 photo/.test(photoPerdue) && /sans photo/.test(photoPerdue),
    photoPerdue);
  verifier('trois photos perdues : la phrase est au pluriel',
    /3 photos n\u2019ont pas pu être envoyées|3 photos n'ont pas pu être envoyées/
      .test(resumeEnvoiLotTexte({ crees: 5, photosPerdues: 3 })),
    resumeEnvoiLotTexte({ crees: 5, photosPerdues: 3 }));

  // Hors-réseau : le colis existe sur l'appareil mais PAS encore en base. Le dire « enregistré »
  // ferait chercher en vain dans la liste des colis, et quelqu'un le ressaisirait.
  const enAttente = resumeEnvoiLotTexte({ crees: 3, misEnAttente: 2 });
  verifier('les colis en attente hors-réseau ne sont pas comptés comme enregistrés',
    /3 colis enregistrés/.test(enAttente) && /2 colis sont en attente/.test(enAttente), enAttente);
  verifier('le message d\u2019attente promet le départ automatique',
    /retour du réseau/.test(enAttente), enAttente);
  verifier('un seul colis en attente : la phrase est au singulier',
    /1 colis est en attente/.test(resumeEnvoiLotTexte({ misEnAttente: 1 })),
    resumeEnvoiLotTexte({ misEnAttente: 1 }));
  verifier('un lot entièrement hors-réseau ne dit pas « aucun colis enregistré »',
    !/Aucun colis/.test(resumeEnvoiLotTexte({ misEnAttente: 4 })),
    resumeEnvoiLotTexte({ misEnAttente: 4 }));
}

/* ==========================================================================================
   5. L'écran lui-même : ce que le code de la page doit contenir
   ========================================================================================== */
titre('L\u2019écran de saisie en lot est bien branché dans l\u2019espace Équipe');
{
  const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');

  verifier('la section existe dans la page', /id="section-lot-colis"/.test(equipe));
  verifier('elle est placée dans l\u2019onglet « Colis »',
    /put\('eqpanel-colis', byId\('section-lot-colis'\)\)/.test(equipe));
  verifier('l\u2019écran est initialisé au chargement', /initLotColis\(\);/.test(equipe));
  verifier('le choix des photos accepte PLUSIEURS fichiers à la fois',
    /id="lot-photos-library"[^>]*multiple/.test(equipe));
  verifier('la loupe plein écran existe', /id="lot-loupe"/.test(equipe));

  // Garde-fou 4 : rien ne part sans un geste humain. Le seul déclencheur est le bouton.
  verifier('l\u2019envoi n\u2019est déclenché que par le bouton « Enregistrer »',
    /e\.target\.closest\('#lot-enregistrer'\)\) lotEnregistrer\(\)/.test(equipe));
  // Il y a maintenant DEUX portes de sortie : le bouton de chaque colis, qui libère sa ligne dès
  // qu'elle est bonne, et le bouton du bas qui enregistre tout ce qui reste. Les deux doivent
  // contrôler avant d'écrire. On regarde donc à l'intérieur de chacune des deux fonctions plutôt
  // que de chercher un appel unique dans la page : c'est exactement le cas où un chemin ajouté
  // plus tard pourrait sauter le contrôle sans que rien ne le dise.
  for (const nom of ['lotEnregistrerUn', 'lotEnregistrer']) {
    verifier(`${nom} contrôle le lot avant le moindre envoi`,
      /verifierLotAvantEnvoi\(/.test(blocDe(equipe, nom)));
  }

  // La description est facultative des deux côtés : formulaire unitaire ET lot.
  verifier('la description n\u2019est plus obligatoire dans le formulaire unitaire',
    /<textarea id="add-desc"(?![^>]*required)/.test(equipe));
  verifier('une description vide devient une colonne vide, pas un texte inventé',
    /description: description \|\| null/.test(equipe));

  // Une seule porte d'entrée vers la base, pour que saisie unitaire, lot et file hors-réseau se
  // comportent exactement pareil.
  const portes = (equipe.match(/await eqInsererColis\(/g) || []).length;
  verifier('les trois chemins d\u2019écriture passent par la même porte (eqInsererColis)',
    portes === 3, portes + ' appel(s) trouvé(s)');
  verifier('plus aucune insertion de colis en direct hors de cette porte',
    !/from\('colis'\)\.insert\(\[(entry\.payload|colisPayload|payload)\]\)/.test(equipe));
}

titre('Les fichiers partagés portent tous la même étiquette de version');
// Une page qui charge l'ancien config.js appellerait des fonctions absentes : l'écran en lot se
// figerait sans message. L'étiquette doit donc être bougée partout en même temps. Le contrôle
// et la liste des fichiers concernés vivent dans tests/etiquettes-de-version.mjs, qui explique
// aussi pourquoi clt-select-recherche.js et theme.js en font partie.
controlerEtiquettesDeVersion({ APP, verifier });

/* ---------- Bilan ---------- */
console.log('\n———');
console.log(`${reussies} vérifications réussies, ${echouees} échouées`);
process.exit(echouees ? 1 : 0);
