// Fonctions communes partagées — Christ Livraison & Transport SARL
// ----------------------------------------------------------------------------
// Ce fichier regroupe les utilitaires STRICTEMENT identiques qui étaient jusqu'ici
// dupliqués à la fois dans config.js (app interne : équipe / livreur / fournisseur /
// login / gestion) et dans express-config.js (CLT Express : client / coursier).
// Une seule définition, chargée AVANT config.js / express-config.js sur chaque page,
// pour éviter toute divergence future entre les deux copies.
//
// IMPORTANT — ne mettre ici QUE ce qui est identique des deux côtés. Les éléments qui
// diffèrent restent volontairement dans chaque fichier :
//   • avatarHTML  — config.js gère aussi company_name (fournisseurs) ; Express non.
//   • friendlyErrorMessage — messages différents selon le produit.
//   • supabaseClient / SUPABASE_URL / SUPABASE_KEY — stockage de session différent.
//   • startPositionSharing et la logique métier propre à chaque produit.
//
// Ce script est un script classique (pas de module) : ses fonctions deviennent des
// globales, utilisables partout (y compris dans les gestionnaires onclick/onerror).

// ---------- Échappement HTML ----------
// CORRECTION DU 21 AOÛT 2026 — à lire avant de « simplifier » cette fonction.
//
// L'ancienne version passait par le navigateur (textContent puis innerHTML). Elle échappait
// bien < > et &, mais PAS les guillemets. Or l'application écrit partout du HTML de la forme
//   data-quelque-chose="${escapeHTML(valeur)}"
// et une partie de ces valeurs vient de saisies libres : nom de quartier, description de colis,
// nom d'entreprise. Il suffisait donc qu'une cliente tape un guillemet droit dans le quartier
// de destination pour refermer l'attribut par accident — au mieux la ligne s'affichait de
// travers, au pire on pouvait glisser un attribut supplémentaire dans la page de l'équipe.
//
// La version ci-dessous échappe aussi " et ', et ne dépend plus du navigateur : elle peut donc
// être vérifiée par les contrôles automatiques (voir tests/carnet-adresses.test.mjs).
// null et undefined donnent une chaîne vide, jamais le texte « undefined ».
function escapeHTML(str) {
  return String(str === null || str === undefined ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------- Lire tout, par tranches (feuille de route 3.1, 16/09/2026) ----------
// La base ne renvoie jamais plus de 1 000 lignes par requête, sans le dire : un rapport qui
// lit « tout » d'un coup devient faux dès la 1 001e ligne, en silence. Cette fonction reçoit
// une FABRIQUE de requête (une fonction qui renvoie une requête neuve, sans range) et enchaîne
// les tranches jusqu'à la dernière. Le résultat est complet ou l'erreur est levée : jamais une
// liste tronquée qui a l'air juste. Tous les rapports (équipe et gestion) passent par ici.
const CLT_TRANCHE = 1000;
async function cltLireTout(construire, tranche) {
  const taille = tranche || CLT_TRANCHE;
  let tout = [], depart = 0;
  for (;;) {
    const { data, error } = await construire().range(depart, depart + taille - 1);
    if (error) throw error;
    tout = tout.concat(data || []);
    if (!data || data.length < taille) return tout;
    depart += taille;
  }
}

/* QUEL ONGLET A ÉTÉ OUVERT — 18 septembre 2026
   ==========================================================================================
   Celtis demande de retirer les onglets qui ne servent pas. Personne ne sait lesquels : rien
   n'était jamais noté. Ce compteur répondra en octobre, et on retirera sur preuve.

   IL NE DIT PAS QUI, et c'est un choix. Pour décider s'il faut retirer un onglet, il suffit de
   savoir si QUELQU'UN l'ouvre ; savoir lequel de l'équipe l'ouvre n'apporte rien à cette
   décision, et transformerait un outil de rangement en outil de surveillance. La table ne porte
   donc que (espace, onglet, jour, fois) — aucun identifiant de personne, vérifié en base.

   IL NE DOIT JAMAIS FAIRE ATTENDRE, NI RIEN CASSER. Un compteur d'usage est la dernière chose
   qui a le droit de ralentir un écran ou d'afficher une erreur : on n'attend pas la réponse, et
   tout échec est avalé en silence. Si la migration n'est pas passée, l'application se comporte
   exactement comme avant.

   UNE FOIS PAR ONGLET ET PAR OUVERTURE DE PAGE. Sans cela, un aller-retour entre deux onglets
   gonflerait le compteur sans rien apprendre : ce qu'on veut savoir, c'est si l'onglet est
   VISITÉ, pas combien de fois on passe devant. */
const CLT_ONGLETS_NOTES = new Set();
function cltNoterOngletOuvert(espace, onglet) {
  try {
    const cle = String(espace) + "/" + String(onglet);
    if (CLT_ONGLETS_NOTES.has(cle)) return;
    CLT_ONGLETS_NOTES.add(cle);
    if (typeof supabaseClient === "undefined" || !supabaseClient) return;
    // Pas de `await` : l'écran continue, et personne n'attend un compteur.
    supabaseClient.rpc("noter_onglet_ouvert", { p_espace: espace, p_onglet: onglet })
      .then(function () {}, function () {});
  } catch (e) { /* un compteur ne fait jamais tomber un écran */ }
}

// ---------- Dates ----------
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) +
    " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/* L'heure seule, sans la date. (29/08/2026)
   Sur la carte d'une tournée, « parti à 09:14 » suffit et tient sur la ligne. Y écrire la date
   complète serait redondant — la tournée est celle d'aujourd'hui — et pousserait le compte à la
   ligne sur un téléphone. Écrite ici plutôt que dans l'écran du livreur parce que le bureau
   affichera bientôt la même heure, et deux mises en forme séparées finissent par afficher deux
   heures différentes pour le même départ. */
function formatHeure(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// ---------- La date du jour, telle que la personne la lit sur son téléphone ----------
// Volontairement PAS toISOString() : celui-ci bascule en heure de Greenwich, et un colis
// enregistré à 1 h du matin à Abidjan (UTC+0 toute l'année, mais la nuance vaut pour tout
// appareil réglé sur un autre fuseau) se retrouverait daté de la veille. On lit donc l'heure
// locale de l'appareil, qui est celle que la personne a sous les yeux.
// Cette fonction vivait en trois exemplaires identiques (equipe, livreur, fournisseur) ;
// trois copies, c'est trois occasions de corriger l'une et d'oublier les deux autres.
function todayLocalISODate() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// ---------- Montants (FCFA) ----------
// UN SEUL SIGNE MOINS DANS TOUT LE PRODUIT — 1er septembre 2026.
// toLocaleString rend le trait d'union du clavier (U+002D) devant un nombre négatif, alors que
// partout ailleurs l'application écrit le vrai signe moins des mathématiques (U+2212) : « −2 500
// Payé à la gare », « −3 000 Frais de course ». Les deux se ressemblent assez pour qu'on ne les
// distingue pas en lisant, et assez peu pour qu'ils ne s'alignent pas dans une colonne de
// chiffres. Sur un relevé envoyé à une vendeuse, deux moins différents côte à côte donnent
// l'impression d'un document bricolé — et c'est exactement l'endroit où il ne faut pas.
// Le passage en PDF est déjà couvert : REMPLACEMENTS_PDF_CLT ramène U+2212 au trait d'union
// ASCII juste avant l'impression, parce que les polices standard ne le connaissent pas.
function formatMontant(n) {
  if (n === null || n === undefined || n === "") return "";
  const num = Number(n);
  if (isNaN(num)) return "";
  return num.toLocaleString("fr-FR").replace(/^-/, "−") + " FCFA";
}

// ---------- Validation numéro de téléphone ivoirien ----------
// Depuis la refonte du plan de numérotation, tous les numéros ivoiriens comptent 10 chiffres
// et commencent par 0 (ex : 07 00 00 00 00). On tolère les espaces/points/tirets de saisie.
function isValidPhoneCI(phone) {
  const digits = (phone || "").replace(/[\s.\-]/g, "");
  return /^0[1-9][0-9]{8}$/.test(digits);
}

// Variante souple : accepte 10 chiffres (plan actuel) ou 8 chiffres (ancien plan), avec ou sans
// indicatif 225. Volontairement souple pour ne jamais bloquer un numéro légitime, mais suffisant
// pour repérer une faute de frappe évidente (numéro trop court/trop long).
function isValidCiPhone(raw) {
  let d = (raw || "").replace(/[^\d]/g, "");
  if (d.startsWith("225")) d = d.slice(3);
  return d.length === 10 || d.length === 8;
}

// ---------- Initiales (avatar par défaut) ----------
// Ex : "Yapo Apo Josatta" -> "YJ". Utilisé tant que la personne n'a pas ajouté de photo.
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// ---------- Ne jamais réécrire à l'identique ----------
// LE PROBLÈME (signalé le 25 août 2026)
// « Ça continue de s'actualiser, s'actualiser ; quand ça s'actualise, ça vibre, et les données
//   saisies s'effacent. »
//
// Le « ça vibre » n'est pas une vibration du téléphone : c'est l'écran qui saute. Toutes les
// 25 secondes — et à chaque évènement Realtime, donc à chaque fois qu'un livreur touche un colis
// n'importe où sur le terrain — les écrans se redessinent d'un bloc. Or dans l'immense majorité
// des cas, ce qui est recalculé est RIGOUREUSEMENT IDENTIQUE à ce qui est déjà affiché. On
// détruisait donc le contenu de la page pour le remplacer par lui-même, plusieurs fois par
// minute. Le navigateur, lui, ne le sait pas : il jette les nœuds, il en refabrique, il perd au
// passage la position de défilement, la valeur choisie dans les listes, le curseur, et le
// panneau d'une liste déroulante ouverte. D'où les trois symptômes à la fois.
//
// LA RÈGLE
// On compare avant d'écrire. Si le HTML calculé est le même que celui en place, on ne touche à
// RIEN — pas un nœud. C'est la correction la plus efficace des trois, parce qu'elle supprime
// l'immense majorité des redessins au lieu d'essayer de les rendre inoffensifs.
//
// On ne RELIT pas element.innerHTML pour comparer, pour deux raisons. D'abord parce que c'est
// coûteux : le navigateur re-sérialise tout le sous-arbre, et sur une liste de trois cents colis
// cela reviendrait à payer une bonne partie du prix qu'on cherche justement à éviter. Ensuite
// parce que le texte relu n'est presque jamais identique à celui écrit — le navigateur normalise
// les guillemets et l'ordre des attributs, et plusieurs écrans ajoutent une ligne à la fin après
// coup. On compare donc ce qu'on GÉNÈRE à ce qu'on avait généré la fois précédente : deux textes
// produits par le même code, donc réellement comparables.
// `empreinte` permet d'ajouter à la comparaison un état qui ne figure pas dans le HTML posé mais
// dont dépend ce qui sera ajouté ensuite (le bouton « Charger plus », par exemple).
// Renvoie true si le DOM a réellement été modifié, false s'il n'y avait rien à faire.
const __cltDernierHTML = new WeakMap();
function cltPoserHTML(element, html, empreinte) {
  if (!element) return false;
  const cle = html + (empreinte === undefined ? "" : "\u0003" + empreinte);
  // `childNodes.length` : si quelque chose a vidé l'élément entre-temps, la mémoire ne vaut plus
  // rien et il faut redessiner, sans quoi l'écran resterait blanc.
  if (__cltDernierHTML.get(element) === cle && element.childNodes.length) return false;
  __cltDernierHTML.set(element, cle);
  element.innerHTML = html;
  return true;
}

// Même principe pour les listes déroulantes, avec une précaution de plus : remplacer les
// <option> remet le choix à zéro. La liste des clientes était reconstruite toutes les 25 s sans
// rien préserver — la cliente sélectionnée dans « Nouveau colis » disparaissait donc toute seule,
// sans que personne ne comprenne pourquoi. On repose le choix après coup, et s'il n'existe plus
// (compte supprimé), on retombe proprement sur l'entrée vide plutôt que sur la première de la
// liste, qui serait un choix que personne n'a fait.
function cltPoserOptions(select, html) {
  if (!select) return false;
  if (__cltDernierHTML.get(select) === html && select.options.length) return false;
  __cltDernierHTML.set(select, html);
  const choix = select.value;
  select.innerHTML = html;
  if (choix) {
    select.value = choix;
    if (select.value !== choix) select.value = "";
  }
  return true;
}

// ---------- Choix d'image (caméra + bibliothèque) ----------
// Relie un ou plusieurs inputs "file" à une même fonction de traitement, en validant que c'est
// bien une image de moins de 15 Mo. La valeur de l'input est réinitialisée à chaque fois pour
// permettre de rechoisir le même fichier ensuite.
function wireImagePicker(inputIds, onFile) {
  const ids = Array.isArray(inputIds) ? inputIds : [inputIds];
  ids.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      input.value = ""; // réinitialisé immédiatement : permet de rechoisir le même fichier ensuite
      if (!file) return;
      if (!file.type || !file.type.startsWith("image/")) {
        cltToast("Choisissez un fichier image.", { type: 'warning' });
        return;
      }
      // Plafond aligné sur la limite réelle du stockage (15 Mo). Les photos sont compressées
      // juste avant l'envoi : ce plafond ne sert donc qu'à écarter un fichier aberrant, il ne
      // doit pas refuser une photo de téléphone récent, qui dépasse souvent 8 Mo.
      if (file.size > 15 * 1024 * 1024) {
        cltToast("L'image est trop volumineuse (15 Mo maximum).", { type: 'warning' });
        return;
      }
      await onFile(file);
    });
  });
}

// ---------- Compression d'image avant envoi ----------
// Les photos prises au téléphone font souvent plusieurs Mo. Envoyées telles quelles, elles
// rendent l'envoi long sur les données mobiles (surtout en zone à faible réseau) et remplissent
// vite l'espace de stockage. On réduit la plus grande dimension à `maxDim` px et on ré-encode en
// JPEG : le poids chute fortement tout en gardant une qualité largement suffisante.
//
// Règle de sécurité : en cas d'échec (fichier non image, navigateur ancien, image corrompue...),
// la fonction renvoie le fichier D'ORIGINE. Elle ne doit JAMAIS empêcher un envoi de se faire.
// De même, la version compressée n'est conservée que si elle est réellement plus légère.
//
// Attention à l'appelant : le résultat peut être un Blob SANS nom de fichier. L'extension doit
// donc être déduite du type MIME (voir cltExtensionFichier ci-dessous), jamais de file.name seul.
async function cltCompressImage(file, { maxDim = 1280, quality = 0.8 } = {}) {
  try {
    if (!file || !file.type || file.type.indexOf("image/") !== 0) return file;
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = dataUrl;
    });
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (!width || !height) return file;
    if (Math.max(width, height) > maxDim) {
      const ratio = maxDim / Math.max(width, height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return (blob && blob.size < file.size) ? blob : file;
  } catch (e) {
    console.warn("Compression de la photo impossible, envoi de l'original :", e);
    return file;
  }
}

// Extension de fichier à utiliser pour un envoi : d'abord le type MIME (seule source fiable
// après compression, car un Blob n'a pas de nom), puis le nom d'origine, puis "jpg" en dernier
// recours. Le nettoyage évite qu'un nom exotique produise un chemin invalide dans le stockage.
function cltExtensionFichier(fichier, nomOrigine) {
  const depuisMime = (fichier && fichier.type && fichier.type.split("/")[1])
    ? fichier.type.split("/")[1].replace("jpeg", "jpg")
    : null;
  const nom = nomOrigine || (fichier && fichier.name) || "";
  const depuisNom = nom.indexOf(".") !== -1 ? nom.split(".").pop() : null;
  const ext = (depuisMime || depuisNom || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || "jpg";
}

// ---------- Modale de confirmation / saisie réutilisable (remplace confirm/prompt natifs) ----------
// Réutilise les classes .confirm-modal-* de style.css (présentes sur toutes les pages) et injecte
// son propre conteneur dans le <body>, sans qu'aucune page n'ait besoin de markup dédié.
// cltConfirm(...) renvoie une promesse résolue à true/false ; cltPrompt(...) renvoie la saisie
// (chaîne) ou null si annulé. Objectif : dialogues cohérents avec le style de l'app, lisibles sur
// mobile, contrairement à confirm()/prompt() natifs.
function __cltEnsureModal() {
  let ov = document.getElementById("clt-modal-overlay");
  if (ov) return ov;
  ov = document.createElement("div");
  ov.id = "clt-modal-overlay";
  ov.className = "confirm-modal-overlay hidden";
  ov.setAttribute("data-clt-couche", "Confirmation");
  ov.innerHTML =
    '<div class="confirm-modal">' +
    '<div class="confirm-modal-icon" id="clt-modal-icon">⚠️</div>' +
    '<h3 class="confirm-modal-title" id="clt-modal-title"></h3>' +
    '<div class="confirm-modal-detail" id="clt-modal-detail" style="display:none;"></div>' +
    '<p class="confirm-modal-sub" id="clt-modal-sub" style="white-space:pre-line;"></p>' +
    '<input type="text" id="clt-modal-input" style="display:none; width:100%; box-sizing:border-box; ' +
    'padding:12px 14px; border:1.5px solid #d6dee8; border-radius:10px; font-size:16px; ' +
    'text-align:center; margin-bottom:18px;" />' +
    '<div class="confirm-modal-actions">' +
    '<button type="button" class="btn" id="clt-modal-cancel" data-clt-fermer style="background:#e5e9ef;color:#222;">Annuler</button>' +
    '<button type="button" class="btn" id="clt-modal-ok">Confirmer</button>' +
    "</div></div>";
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if (e.target === ov) __cltCloseModal(__cltCancelValue); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !ov.classList.contains("hidden")) __cltCloseModal(__cltCancelValue);
  });
  return ov;
}
let __cltModalResolve = null;
let __cltCancelValue = false;
function __cltCloseModal(result) {
  const ov = document.getElementById("clt-modal-overlay");
  if (ov) ov.classList.add("hidden");
  const r = __cltModalResolve;
  __cltModalResolve = null;
  if (r) r(result);
}
function cltConfirm({ title, detail, sub, okLabel, cancelLabel, danger } = {}) {
  const ov = __cltEnsureModal();
  __cltCancelValue = false;
  document.getElementById("clt-modal-title").textContent = title || "Confirmer";
  const d = document.getElementById("clt-modal-detail");
  if (detail) { d.textContent = detail; d.style.display = ""; } else { d.style.display = "none"; }
  document.getElementById("clt-modal-sub").textContent = sub || "";
  document.getElementById("clt-modal-icon").textContent = danger ? "🗑️" : "⚠️";
  document.getElementById("clt-modal-input").style.display = "none";
  const ok = document.getElementById("clt-modal-ok");
  ok.textContent = okLabel || "Confirmer";
  ok.classList.toggle("danger-btn", !!danger);
  document.getElementById("clt-modal-cancel").textContent = cancelLabel || "Annuler";
  ov.classList.remove("hidden");
  ok.onclick = () => __cltCloseModal(true);
  document.getElementById("clt-modal-cancel").onclick = () => __cltCloseModal(false);
  return new Promise((res) => { __cltModalResolve = res; });
}
function cltPrompt({ title, sub, placeholder, okLabel, inputMode, maxLength, defaultValue } = {}) {
  const ov = __cltEnsureModal();
  __cltCancelValue = null;
  document.getElementById("clt-modal-title").textContent = title || "Saisie";
  document.getElementById("clt-modal-detail").style.display = "none";
  document.getElementById("clt-modal-sub").textContent = sub || "";
  document.getElementById("clt-modal-icon").textContent = "🔢";
  const inp = document.getElementById("clt-modal-input");
  inp.style.display = "";
  inp.value = defaultValue || "";
  inp.placeholder = placeholder || "";
  if (inputMode) inp.setAttribute("inputmode", inputMode); else inp.removeAttribute("inputmode");
  if (maxLength) inp.setAttribute("maxlength", String(maxLength)); else inp.removeAttribute("maxlength");
  const ok = document.getElementById("clt-modal-ok");
  ok.textContent = okLabel || "Valider";
  ok.classList.remove("danger-btn");
  document.getElementById("clt-modal-cancel").textContent = "Annuler";
  ov.classList.remove("hidden");
  setTimeout(() => { try { inp.focus(); } catch (e) {} }, 50);
  ok.onclick = () => __cltCloseModal(inp.value);
  document.getElementById("clt-modal-cancel").onclick = () => __cltCloseModal(null);
  inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); __cltCloseModal(inp.value); } };
  return new Promise((res) => { __cltModalResolve = res; });
}

/* =====================================================================
   SORTIR — une seule façon de refermer ce qu'on a ouvert  (27/08/2026)

   Le problème qu'on répare. L'application empile des fenêtres : la fiche
   d'un colis, « Mon compte », une confirmation, un aperçu. Chacune savait
   se fermer, mais chacune à sa manière, réécrite dans son coin : six
   endroits différents géraient la touche Échap, et une nouvelle fenêtre
   pouvait très bien naître en l'oubliant. Surtout, le bouton « retour »
   du téléphone — le geste que tout le monde fait par réflexe — n'était
   traité NULLE PART : avec une fiche ouverte, appuyer dessus ne fermait
   pas la fiche, ça quittait la page. On perdait son travail en croyant
   reculer d'un pas.

   La règle unique. Une fenêtre se déclare avec deux attributs dans le
   HTML, et rien d'autre :

     <div id="…" class="… hidden" data-clt-couche="Mon compte">
       <button … data-clt-fermer>✕</button>

   data-clt-couche nomme la couche ; data-clt-fermer désigne le bouton
   qui la referme. À partir de là tout est automatique, et le sera aussi
   pour les fenêtres qui n'existent pas encore : Échap, le clic au fond
   (si la page le prévoit déjà), et le bouton retour du téléphone.

   Comment ça marche. On ne remplace la fermeture de personne : on la
   REGARDE. Un observateur suit l'affichage réel de chaque couche.

     — Quand une couche s'ouvre, on empile une entrée dans l'historique du
       navigateur. Le « retour » du téléphone a désormais quelque chose à
       défaire avant de quitter la page.
     — Quand le retour du téléphone est pressé, on referme la couche du
       dessus en actionnant SON PROPRE bouton de fermeture. Le retour fait
       donc exactement ce que fait « Annuler » : mêmes nettoyages, mêmes
       promesses résolues. Rien n'est court-circuité.
     — Quand une couche se ferme par l'interface (croix, Annuler, Échap,
       clic au fond), on retire l'entrée qu'on avait posée, pour qu'un
       « retour » plus tard ne bute pas sur une marche vide.

   Le seul piège de ce genre de mécanisme, c'est de confondre les deux
   sens : refermer par l'interface déclenche un history.back(), qui
   déclenche un popstate, qui refermerait à nouveau — une boucle. On
   compte donc les retours qu'on a demandés soi-même (retoursDemandes) et
   on laisse passer ceux-là sans rien faire.

   Et quand c'est le téléphone qui referme, on dépile AVANT de fermer.
   Pas à cause de l'observateur : il se réveille en microtâche, donc
   toujours après nous et jamais pendant — c'est mesuré, dans tous les
   cas ordinaires les deux ordres donnent exactement le même résultat.
   La vraie raison est plus bête et plus sérieuse. Fermer, c'est exécuter
   le code de la page, et ce code peut échouer. S'il échoue, une ligne
   placée derrière lui ne s'exécute jamais : la pile garderait pour
   toujours une couche fantôme, et chaque « retour » suivant s'acharnerait
   sur une fenêtre qui ne se refermera pas — on ne pourrait plus quitter
   la page du tout. Dépiler d'abord, c'est se mettre à l'abri de ce qu'on
   ne contrôle pas.

   LES ONGLETS, AJOUTÉS ICI LE 28 AOÛT 2026. Le même geste posait le même
   problème une marche plus bas. Mesure faite sur l'écran du livreur en
   production : passer de « Mes colis » à « Finance » ne touchait pas à
   l'historique — history.length valait 5 avant, 5 après un changement,
   5 après deux. Le « retour » du téléphone ne ramenait donc pas à
   l'onglet précédent, il quittait l'application. Cinq écrans étaient
   dans ce cas : Livreur, Équipe, Fournisseur, Express client et Express
   coursier. Aucun des huit fichiers de app/ n'appelait history.pushState.

   Pourquoi la réparation vit ICI et pas dans chaque page. Les fenêtres
   posent déjà leurs propres marches et comptent les retours qu'elles se
   demandent à elles-mêmes. Un second empileur écrit à côté fausserait ce
   compte : le retour refermerait une fenêtre ET changerait d'onglet du
   même coup, ou ne ferait plus rien. Un seul mécanisme tient l'historique,
   donc les onglets sont traités par le même, et les cinq écrans sont
   corrigés d'un coup sans qu'aucun n'ait une ligne à écrire.

   Comment. Rien à déclarer non plus : un onglet est un bouton qui porte
   data-clttab (quatre écrans) ou data-eqtab (celui de l'équipe), et
   l'onglet montré est celui qui porte la classe « active ». On regarde,
   là encore, au lieu de remplacer. Quand l'onglet affiché change, on pose
   une marche et on retient d'où l'on venait ; quand le retour est pressé
   et qu'aucune fenêtre n'est ouverte, on dépile et on ACTIONNE le bouton
   de l'onglet précédent — la page fait alors son travail habituel, ses
   listes se rechargent, ses totaux se recalculent. Rien n'est deviné.

   Le piège est le même qu'au-dessus, dans l'autre sens : notre propre clic
   change l'onglet, donc réveille l'observateur, qui reposerait une marche
   et enfermerait dans une boucle. On note l'onglet visé AVANT de cliquer :
   quand l'observateur se réveille, ce qu'il voit est déjà ce qu'on attend
   et il n'a rien à faire. C'est plus sûr qu'un drapeau à baisser après
   coup, qui dépendrait du moment où l'observateur se réveille.

   Une fenêtre ouverte passe TOUJOURS avant les onglets : elle a été
   ouverte après, sa marche est donc au-dessus, et reculer de deux pas d'un
   coup ferait perdre le travail en cours dans la fenêtre.
   ===================================================================== */
(function () {
  var couches = [];          // toutes les fenêtres déclarées sur cette page
  var pile = [];             // celles qui sont ouvertes ; la dernière est celle du dessus
  var retoursDemandes = 0;   // history.back() que NOUS avons demandés, à ne pas réinterpréter

  // Une couche est ouverte si elle est réellement peinte. On ne teste pas la classe « hidden » :
  // gestion.html ferme les siennes en retirant « open », Express en ajoutant « hidden », et une
  // page à venir fera peut-être autrement. Ce que toutes ont en commun, c'est de disparaître de
  // l'écran — c'est donc cela qu'on mesure, une fois pour toutes.
  function estPeinte(el) {
    if (!el || !el.isConnected) return false;
    var st = window.getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden";
  }

  function estOuverte(c) {
    return c.estOuverte ? !!c.estOuverte() : estPeinte(c.element);
  }

  // Refermer une couche, c'est actionner le bouton que la page a elle-même prévu. On ne cache pas
  // l'élément à la main : une modale de confirmation doit résoudre sa promesse, un formulaire doit
  // se vider. Masquer sans prévenir laisserait l'application en attente d'une réponse qui ne
  // viendrait jamais. Le masquage direct n'est qu'un dernier recours, quand rien n'est déclaré.
  function fermer(c) {
    if (typeof c.fermer === "function") { c.fermer(); return; }
    var bouton = c.element.querySelector("[data-clt-fermer]");
    if (bouton) { bouton.click(); return; }
    c.element.classList.add("hidden");
    c.element.classList.remove("open");
  }

  function empiler(n) {
    for (var i = 0; i < n; i++) {
      try { history.pushState({ cltCouche: true }, ""); } catch (e) {}
    }
  }

  // Fait le point entre ce qui est affiché et ce qu'on croyait affiché, puis ne touche à
  // l'historique que du solde. Si une fenêtre se ferme pendant qu'une autre s'ouvre — cas courant
  // quand un bouton d'une fiche ouvre une confirmation — la profondeur ne bouge pas, donc on ne
  // pose ni ne retire rien. Toucher l'historique deux fois dans le même instant le désynchronise.
  function synchroniser() {
    var entrees = 0, sorties = 0;
    couches.forEach(function (c) {
      var ouverte = estOuverte(c);
      var dansLaPile = pile.indexOf(c) !== -1;
      if (ouverte && !dansLaPile) { pile.push(c); entrees++; poserBoutonRetour(c); }
      else if (!ouverte && dansLaPile) { pile.splice(pile.indexOf(c), 1); sorties++; }
    });
    var solde = entrees - sorties;
    if (solde > 0) empiler(solde);
    else if (solde < 0) {
      retoursDemandes++;                       // history.go(-n) ne déclenche qu'un seul popstate
      try { history.go(solde); } catch (e) {}
    }
  }

  // Le « ← Retour » visible. Il ne s'ajoute que si la page a désigné où le mettre, avec
  // data-clt-retour="<sélecteur>", et jamais deux fois. Les fenêtres qui portent déjà un
  // « Annuler » ou un « ← Retour » n'ont rien à déclarer : elles sont déjà claires.
  function poserBoutonRetour(c) {
    var ou = c.element.getAttribute("data-clt-retour");
    if (!ou) return;
    var hote = c.element.querySelector(ou);
    if (!hote || hote.querySelector(".clt-retour")) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "clt-retour";
    b.setAttribute("data-clt-retour-bouton", "");
    b.textContent = "← Retour";
    b.addEventListener("click", function () { fermer(c); });
    hote.insertBefore(b, hote.firstChild);
  }

  // ----- Les onglets -------------------------------------------------------------------------
  // Deux familles seulement, parce qu'il n'en existe que deux : data-clttab sur le livreur, le
  // fournisseur et les deux écrans Express, data-eqtab sur celui de l'équipe. Une troisième
  // n'aurait qu'à s'ajouter ici pour être prise en charge partout.
  var ATTRIBUTS_ONGLET = ["data-clttab", "data-eqtab"];
  var ongletsMontres = {};   // famille -> nom de l'onglet montré la dernière fois qu'on a regardé
  var marchesOnglets = [];   // { famille, nomPrecedent } ; la dernière est celle du dessus
  var boutonsSuivis = [];

  function boutonsDeFamille(famille) {
    return document.querySelectorAll("[" + famille + "]");
  }

  // L'onglet montré est celui dont le bouton porte « active ». C'est la convention des cinq
  // écrans, et c'est aussi ce que voit l'utilisateur : on mesure l'affichage, pas une variable
  // interne que telle page tiendrait à jour et telle autre pas.
  function ongletMontre(famille) {
    var trouve = null;
    boutonsDeFamille(famille).forEach(function (b) {
      if (trouve === null && b.classList.contains("active")) trouve = b.getAttribute(famille);
    });
    return trouve;
  }

  // Revenir à un onglet, c'est cliquer le bouton de la page — jamais déplacer la classe nous-mêmes.
  // Ces boutons rechargent des listes et recalculent des totaux ; bricoler l'affichage laisserait
  // un écran qui a l'air juste et qui montre les chiffres de l'onglet d'avant.
  function allerAOnglet(famille, nom) {
    var cible = null;
    boutonsDeFamille(famille).forEach(function (b) {
      if (cible === null && b.getAttribute(famille) === nom) cible = b;
    });
    if (!cible) return;
    ongletsMontres[famille] = nom;   // noté AVANT le clic : le changement qu'on provoque soi-même
    cible.click();                   // ne doit pas se reposer en marche.
  }

  function synchroniserOnglets() {
    ATTRIBUTS_ONGLET.forEach(function (famille) {
      var montre = ongletMontre(famille);
      if (montre === null) return;                     // pas d'onglets de cette famille sur la page
      // Première fois qu'on voit cette famille : c'est l'état de départ, on n'est allé nulle part,
      // donc aucune marche. Sans ça, le tout premier « retour » ne quitterait plus la page.
      if (!Object.prototype.hasOwnProperty.call(ongletsMontres, famille)) {
        ongletsMontres[famille] = montre;
        return;
      }
      if (ongletsMontres[famille] === montre) return;  // rien n'a bougé, ou c'est nous qui bougeons
      marchesOnglets.push({ famille: famille, nomPrecedent: ongletsMontres[famille] });
      ongletsMontres[famille] = montre;
      empiler(1);
    });
  }

  var observateurOnglets = new MutationObserver(function () { synchroniserOnglets(); });

  function suivreOnglet(b) {
    if (boutonsSuivis.indexOf(b) !== -1) return;
    boutonsSuivis.push(b);
    observateurOnglets.observe(b, { attributes: true, attributeFilter: ["class"] });
  }

  function balayerOnglets(racine) {
    var r = racine || document;
    ATTRIBUTS_ONGLET.forEach(function (famille) {
      if (r.hasAttribute && r.hasAttribute(famille)) suivreOnglet(r);
      r.querySelectorAll("[" + famille + "]").forEach(suivreOnglet);
    });
    synchroniserOnglets();
  }

  // Déclarer une fenêtre. Les pages n'ont normalement rien à appeler : l'attribut suffit. Cette
  // fonction reste publique pour les fenêtres construites en JavaScript, qui n'existent pas encore
  // au chargement — la modale de confirmation partagée, par exemple.
  function enregistrer(element, options) {
    if (!element || couches.some(function (c) { return c.element === element; })) return;
    options = options || {};
    var c = {
      element: element,
      nom: options.nom || element.getAttribute("data-clt-couche") || element.id || "couche",
      fermer: options.fermer,
      estOuverte: options.estOuverte,
    };
    couches.push(c);
    // Une couche déjà ouverte au moment où on la découvre doit entrer dans la pile tout de suite,
    // sans quoi le premier « retour » du téléphone quitterait la page au lieu de la refermer.
    if (estOuverte(c)) { pile.push(c); empiler(1); poserBoutonRetour(c); }
    observateur.observe(element, { attributes: true, attributeFilter: ["class", "style", "hidden"] });
  }

  var observateur = new MutationObserver(function () { synchroniser(); });

  // Le bouton « retour » du téléphone, et la flèche du navigateur.
  window.addEventListener("popstate", function () {
    if (retoursDemandes > 0) { retoursDemandes--; return; }
    var haut = pile[pile.length - 1];
    if (haut) {
      pile.pop();                               // AVANT de fermer : si fermer() échoue, une ligne
      fermer(haut);                             // placée après lui ne s'exécuterait jamais.
      // Si la fermeture n'aboutit pas — le bouton demande une confirmation, par exemple — la couche
      // reste peinte, l'observateur la retrouvera hors de la pile et reposera une entrée. Le retour
      // suivant refermera donc encore. C'est le comportement voulu : on ne s'échappe pas d'un écran
      // qui est toujours là.
      return;
    }
    // Aucune fenêtre ouverte : on remonte alors d'un onglet. On dépile ici aussi AVANT d'agir,
    // pour la même raison — le clic exécute le code de la page, et ce code peut échouer.
    var marche = marchesOnglets.pop();
    if (marche) { allerAOnglet(marche.famille, marche.nomPrecedent); return; }
    // Ni fenêtre ni onglet à remonter : on laisse partir, c'est voulu.
  });

  // Échap, une fois pour toutes. Les fenêtres qui gèrent déjà Échap de leur côté se fermeront
  // simplement par leur propre chemin ; fermer deux fois ne fait rien de plus que fermer.
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var haut = pile[pile.length - 1];
    if (haut) fermer(haut);
  });

  function balayer(racine) {
    (racine || document).querySelectorAll("[data-clt-couche]").forEach(function (el) { enregistrer(el); });
  }

  // Les fenêtres écrites dans le HTML sont trouvées au chargement ; celles que le JavaScript
  // ajoute plus tard le sont quand elles arrivent. On ne surveille que les enfants directs de
  // <body>, là où une fenêtre en plein écran se pose : surveiller tout l'arbre reviendrait à
  // repasser sur chaque ligne de chaque tableau à chaque rafraîchissement, pour rien.
  function demarrer() {
    balayer(document);
    balayerOnglets(document);
    new MutationObserver(function (lots) {
      lots.forEach(function (lot) {
        Array.prototype.forEach.call(lot.addedNodes, function (n) {
          if (n.nodeType !== 1) return;
          if (n.hasAttribute("data-clt-couche")) enregistrer(n);
          else balayer(n);
          balayerOnglets(n);        // les onglets d'un écran construit après coup comptent aussi
        });
      });
    }).observe(document.body, { childList: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();

  // Publié pour les tests et pour les rares fenêtres construites à la main.
  window.cltEnregistrerCouche = enregistrer;
  window.cltFermerCoucheDuDessus = function () { var h = pile[pile.length - 1]; if (h) fermer(h); };
  window.cltCouchesOuvertes = function () { return pile.map(function (c) { return c.nom; }); };
})();

/* =====================================================================
   NOTIFICATIONS PREMIUM — cltToast()
   Bandeau discret en haut de l'écran (verre dépoli, accent par rôle,
   animation « ressort », barre de progression, fermeture manuelle et
   automatique). Remplace les alert() natifs pour un rendu soigné et
   cohérent sur toute l'application. S'appuie sur les classes .clt-toast-*
   de style.css.
   Usage : cltToast("Message", { type:'success'|'error'|'warning'|'info',
                                  title:'…', duration:ms })
   ===================================================================== */
(function () {
  var ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v6"/><circle cx="12" cy="16.6" r="1.15" fill="currentColor" stroke="none"/></svg>',
    info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 11v5"/><circle cx="12" cy="7.4" r="1.15" fill="currentColor" stroke="none"/></svg>'
  };
  var TITLES = { success: 'C\u2019est fait', error: 'Une erreur', warning: 'Attention', info: 'Information' };

  function ensureLayer() {
    var l = document.getElementById('clt-toast-layer');
    if (l) return l;
    l = document.createElement('div');
    l.id = 'clt-toast-layer';
    l.className = 'clt-toast-layer';
    (document.body || document.documentElement).appendChild(l);
    return l;
  }

  function cltToast(message, opts) {
    opts = opts || {};
    var msg = (message == null ? '' : String(message)).trim();
    if (!msg) return { dismiss: function () {} };
    var type = opts.type && ICONS[opts.type] ? opts.type : 'info';
    var title = ('title' in opts) ? opts.title : TITLES[type];
    // Un bouton d'action (typiquement « Annuler ») demande qu'on laisse le temps de le voir
    // et de le viser au doigt : on allonge donc la durée par défaut dans ce cas.
    var action = (opts.action && typeof opts.action.onClick === 'function') ? opts.action : null;
    var duration = opts.duration || (action ? 8000 : type === 'error' ? 5400 : type === 'warning' ? 4200 : 3400);
    var reduce = false;
    try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

    var layer = ensureLayer();
    var el = document.createElement('div');
    el.className = 'clt-toast clt-toast--' + type;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML =
      '<span class="clt-toast__accent"></span>' +
      '<span class="clt-toast__icon">' + ICONS[type] + '</span>' +
      '<div class="clt-toast__body">' +
        (title ? '<div class="clt-toast__title">' + escapeHTML(title) + '</div>' : '') +
        '<div class="clt-toast__msg">' + escapeHTML(msg) + '</div>' +
        (action ? '<button type="button" class="clt-toast__action">' + escapeHTML(action.label || 'Annuler') + '</button>' : '') +
      '</div>' +
      '<button type="button" class="clt-toast__close" aria-label="Fermer">\u2715</button>' +
      '<span class="clt-toast__bar"></span>';
    layer.appendChild(el);

    // Entrée + barre de progression
    var bar = el.querySelector('.clt-toast__bar');
    requestAnimationFrame(function () {
      el.classList.add('in');
      if (bar && !reduce) {
        bar.style.transition = 'transform ' + duration + 'ms linear';
        requestAnimationFrame(function () { bar.style.transform = 'scaleX(0)'; });
      }
    });

    var timer = null, done = false;
    function dismiss() {
      if (done) return; done = true;
      if (timer) clearTimeout(timer);
      el.classList.remove('in'); el.classList.add('out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }
    function arm(ms) { if (timer) clearTimeout(timer); timer = setTimeout(dismiss, ms); }
    arm(duration);

    el.querySelector('.clt-toast__close').addEventListener('click', dismiss);

    // Bouton d'action facultatif. On le neutralise dès le premier clic : sur un téléphone,
    // un double-appui involontaire ne doit pas déclencher deux fois l'annulation.
    var btnAction = el.querySelector('.clt-toast__action');
    if (btnAction && action) {
      var dejaCliquee = false;
      btnAction.addEventListener('click', function () {
        if (dejaCliquee) return;
        dejaCliquee = true;
        btnAction.disabled = true;
        try { action.onClick(); } catch (e) { console.error('Action de notification impossible :', e); }
        dismiss();
      });
    }

    // Pause au survol (ordinateur) ; reprise ensuite.
    el.addEventListener('mouseenter', function () {
      if (timer) clearTimeout(timer);
      if (bar) { bar.style.transition = 'none'; bar.style.transform = getComputedStyle(bar).transform; }
    });
    el.addEventListener('mouseleave', function () {
      if (bar && !reduce) { bar.style.transition = 'transform 1600ms linear'; requestAnimationFrame(function () { bar.style.transform = 'scaleX(0)'; }); }
      arm(1600);
    });
    return { dismiss: dismiss };
  }
  window.cltToast = cltToast;

  // ---- Remplacement élégant de alert() : bandeau au lieu de la fenêtre système ----
  // On classe le message (réussite / erreur / avertissement / info) d'après quelques
  // mots-clés, pour choisir la couleur et l'icône adéquates. Le comportement d'origine
  // (afficher un message, sans valeur de retour) est préservé.
  function classify(s) {
    var t = (s || '').toLowerCase();
    if (/erreur|impossible|échou|echou|refus|invalide|incorrect|introuvable|non pris|indisponible|a échoué|problème|probleme/.test(t)) return 'error';
    if (/veuillez|choisir|indiquer|doivent|obligatoire|manqu|renseign|trop (volumineux|grand|court|long)|valide/.test(t)) return 'warning';
    if (/activé|activées|activees|enregistr|succès|succes|envoyé|envoye|ajouté|ajoute|mis à jour|mise à jour|supprimé|supprime|confirmé|confirme|réussi|reussi|copié|copie/.test(t)) return 'success';
    return 'info';
  }
  try {
    var __cltNativeAlert = window.alert ? window.alert.bind(window) : null;
    window.alert = function (msg) {
      try {
        var s = (msg == null ? '' : String(msg));
        cltToast(s, { type: classify(s) });
      } catch (e) {
        if (__cltNativeAlert) { try { __cltNativeAlert(msg); } catch (e2) {} }
      }
    };
  } catch (e) { /* dégradation silencieuse */ }
})();

/* =====================================================================
   LES NOTIFICATIONS (WEB PUSH) — une seule copie, 16 septembre 2026 (feuille de route 3.6)
   ---------------------------------------------------------------------
   Ce bloc était recopié dans six pages (équipe, livreur, cliente, gestion,
   Express client, Express coursier), à l'identique. Six copies, c'est six
   endroits à corriger le jour où un message change — et cinq oubliés. Il vit
   ici, une fois. Chaque page appelle cltInitPushButton(role, () => id de
   l'utilisateur connecté). La clé publique VAPID n'est pas secrète ; l'envoi
   réel est assuré par la fonction serveur « envoyer-push ».
   ===================================================================== */
const CLT_VAPID_PUBLIC_KEY = 'BGoo20rDx0dlhYT83d7J4xBpaKD7ZWNWeKvk6WE9QAEYuYmgZCkrOEpJYGnyBsJlwG2IIF_gq1_FuIroGB3ICtw';

function cltUrlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function cltPushDisponible(){
  return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
}

async function cltEnregistrerAbonnementPush(subscription, role, userId){
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys && json.keys.p256dh;
  const auth = json.keys && json.keys.auth;
  if (!endpoint || !p256dh || !auth) return { error: { message: 'Abonnement incomplet' } };
  return await supabaseClient.from('push_subscriptions').upsert({
    user_id: userId || null,
    role: role || null,
    endpoint: endpoint,
    p256dh: p256dh,
    auth: auth,
    user_agent: navigator.userAgent
  }, { onConflict: 'endpoint' });
}

async function cltActiverPush(role, userId){
  const btn = document.getElementById('btn-activer-push');
  try {
    if (!cltPushDisponible()) {
      cltToast("Votre navigateur ne prend pas en charge les notifications. Sur iPhone/iPad, installez d'abord l'application sur l'écran d'accueil (Partager → Sur l'écran d'accueil), ouvrez-la depuis l'icône, puis réessayez.", { type: 'info', duration: 9000 });
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      cltToast("Notifications refusées. Vous pouvez les réactiver dans les réglages de votre navigateur.", { type: 'warning' });
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cltUrlBase64ToUint8Array(CLT_VAPID_PUBLIC_KEY) });
    }
    const { error } = await cltEnregistrerAbonnementPush(sub, role, userId);
    if (error) {
      console.error('Enregistrement abonnement push échoué', error);
      cltToast("Impossible d'enregistrer l'abonnement aux notifications. Réessayez plus tard.", { type: 'error' });
      return;
    }
    if (btn) { btn.textContent = '🔔 Notifications activées ✓'; btn.disabled = true; }
    cltToast("Notifications activées : vous serez averti(e) des événements importants même quand l'application est fermée.", { type: 'success' });
  } catch (e) {
    console.error('Erreur activation push', e);
    cltToast("Une erreur est survenue lors de l'activation des notifications.", { type: 'error' });
  }
}

// role : le rôle du compte ; lireUserId : une fonction qui renvoie l'identifiant de l'utilisateur
// connecté au moment de l'appel (chaque page garde son propre `currentUser`).
async function cltInitPushButton(role, lireUserId){
  const btn = document.getElementById('btn-activer-push');
  if (!btn) return;
  if (!cltPushDisponible()) { btn.classList.add('hidden'); return; }
  const userId = () => { try { return lireUserId ? lireUserId() : null; } catch (e) { return null; } };
  btn.addEventListener('click', () => cltActiverPush(role, userId()));
  // Si déjà abonné sur cet appareil, refléter l'état et ré-enregistrer discrètement l'abonnement
  // (au cas où il existerait côté navigateur mais aurait disparu côté serveur).
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === 'granted') {
      await cltEnregistrerAbonnementPush(sub, role, userId());
      btn.textContent = '🔔 Notifications activées ✓';
    }
  } catch (e) { /* silencieux */ }
}

/* =====================================================================
   LE JOURNAL DES ERREURS EN PRODUCTION — 16 septembre 2026 (feuille de route 3.9)
   ---------------------------------------------------------------------
   Une erreur JavaScript sur le téléphone d'un livreur ne laissait aucune
   trace. Chaque page envoie désormais ses erreurs non rattrapées dans la
   table erreurs_client : page, étiquette de version, message, source, ligne,
   extrait de pile, navigateur. Cinq par minute au plus, la même erreur une
   seule fois par page ouverte : un bug en boucle ne doit pas remplir la base.
   Jamais bloquant : si l'envoi échoue, il échoue en silence.
   ===================================================================== */
(function () {
  const vues = new Set();
  let quota = 5, remiseQuota = 0;
  function versionDeLaPage() {
    try {
      const s = document.querySelector('script[src*="clt-common.js"]');
      return (s && cltEtiquetteDeLAdresse(s.src)) || '';
    } catch (e) { return ''; }
  }
  function roleDeLaPage() {
    try { return (document.body && document.body.dataset && document.body.dataset.role) || (location.pathname.split('/').pop() || '').replace('.html', ''); } catch (e) { return ''; }
  }
  async function envoyer(entree) {
    try {
      const maintenant = Date.now();
      if (maintenant > remiseQuota) { quota = 5; remiseQuota = maintenant + 60000; }
      if (quota <= 0) return;
      const cle = entree.message + '|' + entree.source + '|' + entree.ligne;
      if (vues.has(cle)) return;
      vues.add(cle); quota -= 1;
      if (typeof supabaseClient === 'undefined' || !supabaseClient || !supabaseClient.auth) return;
      const { data } = await supabaseClient.auth.getUser();
      const user = data && data.user;
      if (!user) return;
      await supabaseClient.from('erreurs_client').insert({
        user_id: user.id,
        role: roleDeLaPage(),
        page: (location.pathname.split('/').pop() || 'index.html'),
        version: versionDeLaPage(),
        message: String(entree.message || 'Erreur sans message').slice(0, 500),
        source: entree.source ? String(entree.source).replace(/\?v=.*$/, '').slice(-120) : null,
        ligne: entree.ligne || null,
        pile: entree.pile ? String(entree.pile).slice(0, 1500) : null,
        navigateur: (navigator.userAgent || '').slice(0, 200)
      });
    } catch (e) { /* jamais bloquant */ }
  }
  window.cltSignalerErreur = function (message, detail) { envoyer({ message: message, source: detail && detail.source, ligne: detail && detail.ligne, pile: detail && detail.pile }); };
  window.addEventListener('error', function (ev) {
    if (!ev) return;
    const err = ev.error;
    envoyer({ message: ev.message || (err && err.message), source: ev.filename, ligne: ev.lineno, pile: err && err.stack });
  });
  window.addEventListener('unhandledrejection', function (ev) {
    const r = ev && ev.reason;
    envoyer({ message: (r && (r.message || String(r))) || 'Promesse rejetée sans message', source: null, ligne: null, pile: r && r.stack });
  });
})();

/* =====================================================================
   LE BOUTON « ACTUALISER » — ajout du 25 août 2026
   ---------------------------------------------------------------------
   POURQUOI IL EXISTE
   Les trois tableaux de bord se rafraîchissaient tout seuls : à chaque
   événement temps réel, toutes les 25 secondes, et à chaque retour de
   l'application au premier plan. Chacun de ces rafraîchissements
   reconstruisait la liste des colis d'un bloc (`innerHTML = ...`).

   Tant qu'on se contente de regarder, c'est parfait. Mais dès qu'on écrit
   dedans — corriger une adresse, choisir un livreur, taper un montant — la
   liste se reconstruit SOUS LES DOIGTS. Le champ à moitié rempli est remplacé
   par un champ neuf, et la moitié déjà tapée disparaît. Sur la vidéo du
   25/08 on lit « Daloa exgare TSRR » : deux saisies successives entrelacées
   par un rendu tombé au milieu. Ce n'est pas une gêne, c'est une donnée
   fausse qui part en base.

   LA RÈGLE RETENUE
   Le temps réel continue de tout mettre à jour tout seul — c'est ce qu'on
   veut, et c'est instantané. MAIS il ne redessine JAMAIS pendant qu'on écrit.
   Quand une saisie est en cours, le rendu est mis de côté ; un compteur
   discret apparaît sur le bouton (« 3 »), et le rendu s'applique dès que la
   saisie est finie — ou immédiatement si l'on appuie soi-même sur Actualiser.

   Ce composant ne fait que la partie visible : le bouton, son état, son
   compteur. C'est chaque écran qui décide de ce que « rafraîchir » veut dire
   chez lui, et qui déclare quand une saisie est en cours.

   API
     CLTActualiser.installer({ id, onActualiser, saisieEnCours })
     CLTActualiser.signalerEnAttente(n)   — n mises à jour retenues
     CLTActualiser.viderAttente()
     CLTActualiser.tourner(bool)          — état « en train de charger »
   ===================================================================== */
(function () {
  "use strict";

  var etat = {
    bouton: null,
    badge: null,
    onActualiser: null,
    saisieEnCours: null,
    enAttente: 0,
    enCours: false,
  };

  function majBadge() {
    if (!etat.badge) return;
    if (etat.enAttente > 0) {
      etat.badge.textContent = etat.enAttente > 99 ? "99+" : String(etat.enAttente);
      etat.badge.hidden = false;
      etat.bouton.classList.add("a-du-neuf");
      // Le titre dit ce que le chiffre veut dire. Un badge orange sans explication
      // inquiète sans rien apprendre.
      etat.bouton.title = etat.enAttente === 1
        ? "1 mise à jour reçue, gardée de côté pendant votre saisie. Touchez pour l'afficher."
        : etat.enAttente + " mises à jour reçues, gardées de côté pendant votre saisie. Touchez pour les afficher.";
    } else {
      etat.badge.hidden = true;
      etat.bouton.classList.remove("a-du-neuf");
      etat.bouton.title = "Actualiser maintenant";
    }
  }

  function installer(opts) {
    opts = opts || {};
    var btn = document.getElementById(opts.id || "btn-actualiser");
    if (!btn) return null;
    etat.bouton = btn;
    etat.badge = btn.querySelector(".clt-actualiser-badge");
    etat.onActualiser = typeof opts.onActualiser === "function" ? opts.onActualiser : null;
    etat.saisieEnCours = typeof opts.saisieEnCours === "function" ? opts.saisieEnCours : null;

    btn.addEventListener("click", function () {
      if (etat.enCours) return;
      lancer();
    });
    majBadge();
    return { lancer: lancer };
  }

  // Le mot qu'on affiche quand tout s'est bien passé. On donne l'HEURE, pas un simple « c'est
  // fait » : neuf fois sur dix, actualiser ne change rien à l'écran parce qu'il n'y avait rien
  // de neuf — et c'est justement ce silence qui fait croire que le bouton est cassé. L'heure,
  // elle, change à chaque appui : elle prouve que la demande est bien partie et bien revenue.
  function deuxChiffres(n) { return (n < 10 ? "0" : "") + n; }
  function direQueCEstFait(ok) {
    if (typeof window.cltToast !== "function") return;
    if (!ok) {
      window.cltToast(
        "La mise à jour n'a pas abouti. Vérifiez la connexion, puis réessayez.",
        { type: "warning", duration: 6000 });
      return;
    }
    var d = new Date();
    window.cltToast(
      "Liste à jour à " + deuxChiffres(d.getHours()) + ":" + deuxChiffres(d.getMinutes()) + ".",
      { type: "success", duration: 2600 });
  }

  function lancer() {
    if (!etat.onActualiser || etat.enCours) return;
    etat.enCours = true;
    tourner(true);
    // Trois chemins peuvent vouloir terminer : la réussite, l'échec, et le garde-fou de temps.
    // Sans ce verrou, deux d'entre eux se déclencheraient l'un après l'autre et on afficherait
    // deux messages contradictoires pour un seul appui.
    var dejaFini = false;
    var minuteur = null;
    var fini = function (ok) {
      if (dejaFini) return;
      dejaFini = true;
      if (minuteur) { clearTimeout(minuteur); minuteur = null; }
      etat.enCours = false;
      tourner(false);
      etat.enAttente = 0;
      majBadge();
      direQueCEstFait(ok !== false);
    };
    // GARDE-FOU. tourner(true) DÉSACTIVE le bouton ; c'est fini() qui le réactive. Si la
    // requête reste suspendue — réseau qui accepte la connexion mais ne répond jamais, cas
    // très ordinaire en 3G faible — rien ne rappelle fini(), et le bouton reste grisé pour
    // toujours : on appuie, plus rien ne se passe, jamais. C'est exactement l'impression d'un
    // bouton mort. Au bout de quinze secondes on rend donc la main, avec une explication.
    minuteur = setTimeout(function () { fini(false); }, 15000);
    var r;
    try { r = etat.onActualiser(); }
    catch (e) { console.error("Actualisation impossible :", e); fini(false); return; }
    if (r && typeof r.then === "function") {
      r.then(function () { fini(true); }, function (e) { console.error(e); fini(false); });
    }
    // Un rafraîchissement qui rend la main tout de suite reste visible une demi-seconde :
    // sans ce délai, on appuie et il ne se passe rien à l'œil, alors qu'en réalité tout
    // s'est fait. On finit par appuyer trois fois de suite.
    else setTimeout(function () { fini(true); }, 500);
  }

  function tourner(oui) {
    if (!etat.bouton) return;
    etat.bouton.classList.toggle("tourne", !!oui);
    etat.bouton.disabled = !!oui;
  }

  function signalerEnAttente(n) {
    etat.enAttente = Math.max(0, Number(n) || 0);
    majBadge();
  }
  function viderAttente() { signalerEnAttente(0); }
  function saisieEnCours() {
    try { return etat.saisieEnCours ? !!etat.saisieEnCours() : false; }
    catch (e) { return false; }
  }

  window.CLTActualiser = {
    installer: installer,
    lancer: lancer,
    tourner: tourner,
    signalerEnAttente: signalerEnAttente,
    viderAttente: viderAttente,
    saisieEnCours: saisieEnCours,
    get enAttente() { return etat.enAttente; },
  };
})();

/* =====================================================================
   POLISSAGE EXPRESS — retour tactile (ripple) sur les boutons .btn
   Écoute déléguée : fonctionne pour tous les boutons présents ou créés
   dynamiquement. Désactivé si l'usager a demandé moins d'animations.
   ===================================================================== */
(function () {
  try {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest(".btn") : null;
      if (!btn || btn.disabled) return;
      var rect = btn.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height);
      var span = document.createElement("span");
      span.className = "clt-ripple";
      span.style.width = span.style.height = size + "px";
      span.style.left = (e.clientX - rect.left) + "px";
      span.style.top = (e.clientY - rect.top) + "px";
      btn.appendChild(span);
      setTimeout(function () { if (span.parentNode) span.parentNode.removeChild(span); }, 600);
    }, true);
  } catch (err) { /* dégradation silencieuse */ }
})();

/* =====================================================================
   BOUTON « RETOUR EN HAUT » — ajout du 19 août 2026
   ---------------------------------------------------------------------
   Les écrans de l'application sont longs : la liste des colis du jour, le
   relevé d'une cliente, les tableaux de la Gestion. Une fois descendu tout
   en bas, remonter au menu demandait un long balayage du pouce. Ce bouton
   apparaît dès qu'on a dépassé un écran et demi de défilement, et ramène
   en haut d'un geste.

   Il se pose tout seul sur chaque page qui charge ce fichier : aucune balise
   à ajouter dans le HTML, aucun risque d'en oublier une. Il évite aussi de
   se poser deux fois si la page en possède déjà un (le site public en a un,
   défini dans index.html).

   Détail d'implantation : plusieurs espaces (livreur, client Express,
   coursier Express) affichent sur mobile une barre d'onglets fixée en bas de
   l'écran. On la détecte pour décaler le bouton au-dessus d'elle, sinon il la
   recouvrirait — et c'est justement là que se trouvent les boutons les plus
   utilisés.
   ===================================================================== */
(function () {
  try {
    if (window.__cltBoutonHaut) return;           // déjà installé
    window.__cltBoutonHaut = true;

    function installer() {
      // Le site public a son propre bouton (.back-to-top) : on ne double pas.
      if (document.querySelector(".back-to-top") || document.querySelector(".clt-haut")) return;
      if (!document.body) return;

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "clt-haut";
      btn.setAttribute("aria-label", "Remonter en haut de la page");
      btn.title = "Remonter en haut";
      // Flèche dessinée en SVG : nette à toutes les tailles, et aucune
      // dépendance à une police d'icônes que l'app ne charge pas.
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
      document.body.appendChild(btn);

      // Décalage au-dessus de la barre d'onglets basse, si la page en a une.
      if (document.querySelector(".clt-bottomnav")) btn.classList.add("clt-haut--barre");

      var reduire = false;
      try { reduire = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

      btn.addEventListener("click", function () {
        try {
          window.scrollTo({ top: 0, behavior: reduire ? "auto" : "smooth" });
        } catch (e) {
          window.scrollTo(0, 0);                   // navigateur ancien
        }
      });

      // Seuil : un écran et demi. En dessous, remonter au doigt est immédiat et
      // le bouton ne ferait qu'encombrer.
      var visible = false;
      function evaluer() {
        var y = window.pageYOffset || document.documentElement.scrollTop || 0;
        var doitEtreVisible = y > Math.max(320, window.innerHeight * 1.5);
        if (doitEtreVisible === visible) return;   // rien à faire : on évite de toucher au DOM
        visible = doitEtreVisible;
        btn.classList.toggle("visible", visible);
      }

      // Le défilement déclenche des dizaines d'évènements par seconde ; on ne
      // recalcule qu'une fois par image affichée.
      var enAttente = false;
      function auDefilement() {
        if (enAttente) return;
        enAttente = true;
        window.requestAnimationFrame(function () { enAttente = false; evaluer(); });
      }
      window.addEventListener("scroll", auDefilement, { passive: true });
      window.addEventListener("resize", auDefilement);
      evaluer();
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", installer);
    } else {
      installer();
    }
  } catch (err) { /* dégradation silencieuse : l'absence du bouton ne casse rien */ }
})();

/* ---------- Prévenir qu'une nouvelle version est publiée ----------
   ------------------------------------------------------------------------------------------
   POURQUOI CE BLOC EXISTE

   Le 26 août 2026, la fiche « Son écran » a été publiée, vérifiée fichier par fichier sur le
   serveur — et restée invisible. Le serveur servait bien la nouvelle version ; l'application
   ouverte sur les téléphones, elle, continuait d'afficher l'ancienne. Une application installée
   ne recharge pas toute seule : elle peut rester ouverte des jours. Rien, dans le code, ne lui
   disait qu'une nouvelle version existait. Publier « avec succès » et ne rien changer pour
   personne est le pire des deux mondes : on croit le problème réglé, l'équipe travaille encore
   sur l'ancien écran, et l'écart ne se voit qu'au moment où il coûte cher.

   LA MÉTHODE, ET CE QU'ELLE ÉVITE

   Chaque page charge ses fichiers partagés avec une étiquette de version (« ?v=20260826maj »).
   Cette étiquette est déjà la source de vérité de la maison, et un contrôle automatique impose
   qu'il n'y en ait qu'UNE seule pour tous les fichiers partagés. On la compare simplement à
   celle que le serveur annonce dans app/version.json — un fichier de quelques octets, pas la
   page entière : sur un téléphone en données mobiles, aller rechercher 400 Ko toutes les quinze
   minutes pour apprendre qu'il n'y a rien de neuf serait payé par le livreur.

   CE QU'ON NE FAIT PAS, ET POURQUOI

   On ne recharge JAMAIS l'application d'autorité. C'est la solution évidente, et c'est celle
   qui a déjà fait des dégâts ici : une actualisation qui tombe pendant une saisie efface les
   champs, et c'est exactement le défaut qui a été signalé et corrigé en août. Le bandeau
   attend qu'on clique. Tant que personne ne clique, rien ne bouge.

   Et on ne prévient que si l'on SAIT. Étiquette locale illisible, repère injoignable, JSON
   malformé, hors-ligne : dans tous ces cas on se tait. Un bandeau qui crie au loup à chaque
   coupure de réseau serait ignoré au bout de deux jours, et il ne servirait plus le jour où
   il aurait raison. « Je ne sais pas » ne doit jamais s'afficher comme « il y a du neuf ». */

// Relève l'étiquette portée par l'adresse d'un fichier (« …/clt-common.js?v=20260826maj »).
// Renvoie une chaîne vide si l'adresse n'en porte pas : sans étiquette on ne sait rien, et
// « on ne sait rien » ne doit rien déclencher.
function cltEtiquetteDeLAdresse(adresse) {
  const m = String(adresse === null || adresse === undefined ? "" : adresse).match(/[?&]v=([A-Za-z0-9._-]+)/);
  return m ? m[1] : "";
}

// La décision, isolée pour être vérifiable par les contrôles automatiques (voir
// tests/bandeau-nouvelle-version.test.mjs). On ne prévient que si les DEUX étiquettes sont
// connues et qu'elles diffèrent. Toute autre situation — l'une des deux vide, l'une des deux
// qui n'est pas du texte — est une ignorance, pas une nouvelle version.
function cltDoitPrevenirMaj(locale, serveur) {
  if (typeof locale !== "string" || typeof serveur !== "string") return false;
  if (!locale || !serveur) return false;
  return locale !== serveur;
}

/* =====================================================================
   « QUOI DE NEUF ? » — 16 septembre 2026 (demande de Celtis)
   ---------------------------------------------------------------------
   Une mise à jour qui arrive sans un mot, c'est une équipe qui découvre les changements au
   hasard. app/nouveautes.json dit, en clair, ce que chaque étiquette apporte. Ce panneau le
   montre : depuis le bandeau « Nouvelle version », une fois juste après une mise à jour (un
   bandeau discret « Mise à jour installée — Quoi de neuf ? »), et depuis la page de connexion.
   Le fichier est lu à la demande, jamais depuis le cache (comme version.json).
   ===================================================================== */
function cltUrlACote(nomFichier) {
  var tous = document.querySelectorAll('script[src*="clt-common.js"]');
  var src = (tous.length ? tous[tous.length - 1].src : "") || "";
  return src.replace(/[^/]*$/, "") + nomFichier;
}
function cltAfficherNouveautes(options) {
  options = options || {};
  var ancien = document.getElementById("clt-nouveautes");
  if (ancien) ancien.remove();
  var ov = document.createElement("div");
  ov.id = "clt-nouveautes"; ov.className = "clt-nouveautes";
  ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Quoi de neuf ?");
  var boite = document.createElement("div"); boite.className = "clt-nouveautes__boite";
  var tete = document.createElement("div"); tete.className = "clt-nouveautes__tete";
  var titre = document.createElement("h2"); titre.textContent = "Quoi de neuf ?";
  var fermer = document.createElement("button"); fermer.type = "button"; fermer.className = "clt-nouveautes__fermer"; fermer.setAttribute("aria-label", "Fermer"); fermer.textContent = "×";
  tete.appendChild(titre); tete.appendChild(fermer);
  var corps = document.createElement("div"); corps.className = "clt-nouveautes__corps";
  corps.textContent = "Chargement…";
  boite.appendChild(tete); boite.appendChild(corps); ov.appendChild(boite);
  function clore() { ov.remove(); document.removeEventListener("keydown", surTouche); }
  function surTouche(e) { if (e.key === "Escape") clore(); }
  fermer.addEventListener("click", clore);
  ov.addEventListener("click", function (e) { if (e.target === ov) clore(); });
  document.addEventListener("keydown", surTouche);
  document.body.appendChild(ov);
  fermer.focus();
  fetch(cltUrlACote("nouveautes.json"), { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (j) {
      corps.textContent = "";
      var entrees = (j && Array.isArray(j.entrees)) ? j.entrees : [];
      if (!entrees.length) { corps.textContent = "Rien à signaler pour le moment."; return; }
      entrees.slice(0, options.max || 6).forEach(function (e, i) {
        var bloc = document.createElement("section"); bloc.className = "clt-nouveautes__entree" + (i === 0 ? " est-recente" : "");
        var h = document.createElement("h3"); h.textContent = e.titre || "Mise à jour";
        var d = document.createElement("div"); d.className = "clt-nouveautes__date"; d.textContent = (e.date || "") + (e.version ? " · " + e.version : "");
        var ul = document.createElement("ul");
        (e.points || []).forEach(function (pt) { var li = document.createElement("li"); li.textContent = pt; ul.appendChild(li); });
        bloc.appendChild(h); bloc.appendChild(d); bloc.appendChild(ul); corps.appendChild(bloc);
      });
    })
    .catch(function () { corps.textContent = "Les nouveautés ne sont pas disponibles hors connexion."; });
  return { fermer: clore };
}
window.cltAfficherNouveautes = cltAfficherNouveautes;

/* =====================================================================
   LA GRILLE TARIFAIRE, DANS L'APP — 16 septembre 2026 (demande de Celtis)
   ---------------------------------------------------------------------
   « Que la grille soit disponible sur tous les comptes, consultable à tout moment, sans onglet
   de plus. » Un bouton « 📋 Tarifs » dans le menu de chaque espace ouvre cette fenêtre : on
   choisit la commune de départ, la liste des prix vers chaque commune s'affiche — la même
   lecture que la fiche PDF envoyée aux clients, et le même code (MATRICE_TARIFS dans
   lib/communes-et-tarifs.js) : il n'existe qu'une grille. Rien n'est lu en réseau : ça marche
   hors connexion, chez un livreur sur la route comme chez une cliente.
   ===================================================================== */
function cltTarifsLignes(depart) {
  var M = (typeof MATRICE_TARIFS !== "undefined") ? MATRICE_TARIFS : null;
  if (!M || !M[depart]) return [];
  var lignes = [
    { prix: 1000, zone: "Dans " + depart + ", quartiers voisins", detail: "trajet très court" },
    { prix: 1500, zone: "Dans " + depart + ", ailleurs dans la commune", detail: "" },
  ];
  Object.keys(M[depart]).filter(function (c) { return c !== depart; })
    .map(function (c) { return { prix: M[depart][c], zone: c, detail: "" }; })
    .sort(function (a, b) { return a.prix - b.prix || a.zone.localeCompare(b.zone, "fr"); })
    .forEach(function (l) { lignes.push(l); });
  return lignes;
}
function cltAfficherTarifs(options) {
  options = options || {};
  var communes = (typeof COMMUNES !== "undefined") ? COMMUNES.slice() : [];
  if (!communes.length) { if (typeof cltToast === "function") cltToast("La grille n'est pas chargée sur cette page."); return; }
  var ancien = document.getElementById("clt-tarifs"); if (ancien) ancien.remove();
  var depart = options.depart && communes.indexOf(options.depart) >= 0 ? options.depart : null;
  try { depart = depart || localStorage.getItem("clt_tarifs_depart"); } catch (e) {}
  if (!depart || communes.indexOf(depart) < 0) depart = communes.indexOf("Cocody") >= 0 ? "Cocody" : communes[0];
  var COULEUR = { 1000: "#B8791C", 1500: "#1B4374", 2000: "#6A48D7", 2500: "#C8560F", 3000: "#B3261E" };
  var F = function (n) { return (typeof formatMontant === "function") ? formatMontant(n).replace(" FCFA", " F") : n + " F"; };
  var ov = document.createElement("div"); ov.id = "clt-tarifs"; ov.className = "clt-nouveautes clt-tarifs";
  ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Grille tarifaire");
  var boite = document.createElement("div"); boite.className = "clt-nouveautes__boite";
  var tete = document.createElement("div"); tete.className = "clt-nouveautes__tete";
  var titre = document.createElement("h2"); titre.textContent = "Grille tarifaire";
  var fermer = document.createElement("button"); fermer.type = "button"; fermer.className = "clt-nouveautes__fermer"; fermer.setAttribute("aria-label", "Fermer"); fermer.textContent = "×";
  tete.appendChild(titre); tete.appendChild(fermer);
  var corps = document.createElement("div"); corps.className = "clt-nouveautes__corps";
  var choix = document.createElement("div"); choix.className = "clt-tarifs__depart";
  var lab = document.createElement("label"); lab.textContent = "Commune de départ"; lab.setAttribute("for", "clt-tarifs-depart");
  var sel = document.createElement("select"); sel.id = "clt-tarifs-depart";
  communes.forEach(function (c) { var o = document.createElement("option"); o.value = c; o.textContent = c; if (c === depart) o.selected = true; sel.appendChild(o); });
  choix.appendChild(lab); choix.appendChild(sel);
  var intro = document.createElement("p"); intro.className = "clt-tarifs__intro";
  var liste = document.createElement("div"); liste.className = "clt-tarifs__liste";
  var pied = document.createElement("div"); pied.className = "clt-tarifs__pied";
  function dessiner() {
    var d = sel.value;
    try { localStorage.setItem("clt_tarifs_depart", d); } catch (e) {}
    intro.textContent = "Au départ de " + d + " : le prix dépend de la destination, et il est le même dans les deux sens. Il reste modifiable à la saisie.";
    liste.innerHTML = "";
    cltTarifsLignes(d).forEach(function (l) {
      var row = document.createElement("div"); row.className = "clt-tarifs__ligne" + (l.prix === 3000 ? " est-loin" : "");
      var pastille = document.createElement("span"); pastille.className = "clt-tarifs__pastille"; pastille.style.background = COULEUR[l.prix] || "#1B4374";
      var zone = document.createElement("span"); zone.className = "clt-tarifs__zone"; zone.textContent = l.zone;
      if (l.detail) { var small = document.createElement("small"); small.textContent = " " + l.detail; zone.appendChild(small); }
      var prix = document.createElement("strong"); prix.className = "clt-tarifs__prix"; prix.style.color = COULEUR[l.prix] || "#1B4374"; prix.textContent = F(l.prix);
      row.appendChild(pastille); row.appendChild(zone); row.appendChild(prix); liste.appendChild(row);
    });
    var gare = (d === "Adjamé" || d === "Yopougon");
    pied.innerHTML = "";
    var exp = document.createElement("div"); exp.className = "clt-tarifs__ligne est-expedition";
    var p1 = document.createElement("span"); p1.className = "clt-tarifs__pastille"; p1.style.background = "#1B4374";
    var z1 = document.createElement("span"); z1.className = "clt-tarifs__zone"; z1.textContent = "Expédition vers l’intérieur : course jusqu’à la gare";
    var s1 = document.createElement("small"); s1.textContent = " + frais du transporteur, réglés à la gare"; z1.appendChild(s1);
    var x1 = document.createElement("strong"); x1.className = "clt-tarifs__prix"; x1.textContent = gare ? "2 500 – 3 000 F" : "3 000 F";
    exp.appendChild(p1); exp.appendChild(z1); exp.appendChild(x1); pied.appendChild(exp);
    var note = document.createElement("p"); note.className = "clt-tarifs__note";
    note.textContent = "Songon et les localités hors de cette liste : sur devis. Suppléments : livraison express + 1 500 F, créneau fixe + 500 F, colis de plus de 5 kg + 500 F par kg.";
    pied.appendChild(note);
  }
  sel.addEventListener("change", dessiner); dessiner();
  corps.appendChild(choix); corps.appendChild(intro); corps.appendChild(liste); corps.appendChild(pied);
  boite.appendChild(tete); boite.appendChild(corps); ov.appendChild(boite); document.body.appendChild(ov);
  function clore() { ov.remove(); document.removeEventListener("keydown", surTouche); }
  function surTouche(e) { if (e.key === "Escape") clore(); }
  fermer.addEventListener("click", clore);
  ov.addEventListener("click", function (e) { if (e.target === ov) clore(); });
  document.addEventListener("keydown", surTouche);
  return ov;
}
window.cltAfficherTarifs = cltAfficherTarifs;

(function () {
  try {
    // L'étiquette de CETTE page, lue sur le script en train de s'exécuter. Pas de valeur écrite
    // en dur ici : une constante recopiée finirait par mentir le jour où elle serait oubliée.
    let script = document.currentScript;
    if (!script) {
      const tous = document.querySelectorAll('script[src*="clt-common.js"]');
      script = tous[tous.length - 1] || null;
    }
    const adresse = (script && script.src) || "";
    const etiquetteLocale = cltEtiquetteDeLAdresse(adresse);
    if (!etiquetteLocale) return;

    // Le repère est cherché à côté du script, pas à une adresse absolue : l'application doit
    // continuer de fonctionner si elle est un jour servie depuis un sous-dossier.
    const urlRepere = adresse.replace(/[^/]*$/, "") + "version.json";

    // Juste après une mise à jour (l'étiquette chargée n'est pas celle vue la dernière fois),
    // un bandeau discret propose de lire ce qui change. Une seule fois par étiquette.
    try {
      var vue = localStorage.getItem("clt_version_vue");
      if (vue && vue !== etiquetteLocale && typeof cltToast === "function") {
        setTimeout(function () {
          cltToast("Mise à jour installée.", { type: "success", title: "Nouvelle version", duration: 9000,
            action: { label: "Quoi de neuf ?", onClick: function () { cltAfficherNouveautes(); } } });
        }, 1200);
      }
      localStorage.setItem("clt_version_vue", etiquetteLocale);
    } catch (e) { /* stockage indisponible : tant pis pour le mot d'accueil */ }

    const DELAI_FOND = 15 * 60 * 1000;    // vérification tranquille, en arrière-plan
    const DELAI_RETOUR = 2 * 60 * 1000;   // au retour à l'écran, au plus une fois par deux minutes
    const DELAI_REPORT = 30 * 60 * 1000;  // « plus tard » : on se fait discret une demi-heure
    let derniereVerif = Date.now();
    let masqueJusqua = 0;
    let bandeau = null;

    // Le bandeau occupe désormais le bas de l'écran, là où se tient déjà le bouton « Remonter
    // en haut ». Plutôt que de le recouvrir — il passerait devant, avec son z-index bien plus
    // haut — on marque le <body> pendant qu'il est visible et la feuille de style fait monter
    // le bouton d'autant.
    //
    // De combien ? On MESURE, on ne devine pas. La hauteur du bandeau dépend de la largeur de
    // l'écran et de la taille de police choisie par la personne : une ligne sur un ordinateur,
    // trois sur un téléphone étroit. Un chiffre écrit en dur dans le CSS serait juste sur une
    // machine et faux sur la suivante — c'est vérifié : à 390 px de large le bandeau fait
    // 104 px de haut, quand une estimation raisonnable en donnait 64. On publie donc la
    // hauteur réelle dans --clt-maj-h et le CSS s'en sert.
    function marquerCorps(visible) {
      try { document.body.classList.toggle("clt-maj-visible", !!visible); } catch (e) {}
      if (!visible) { try { document.documentElement.style.removeProperty("--clt-maj-h"); } catch (e) {} }
    }

    function mesurerBandeau() {
      if (!bandeau || bandeau.hidden) return;
      var h = bandeau.offsetHeight || 0;
      if (h) document.documentElement.style.setProperty("--clt-maj-h", h + "px");
    }

    function poser() {
      if (!document.body) return;
      if (bandeau && document.body.contains(bandeau)) { bandeau.hidden = false; marquerCorps(true); mesurerBandeau(); return; }
      bandeau = document.createElement("div");
      bandeau.className = "clt-maj-bandeau";
      bandeau.setAttribute("role", "status");
      // Construction par éléments : ce bandeau n'affiche aucune donnée saisie, mais il s'ajoute
      // à des pages qui en affichent beaucoup, et on ne prend pas l'habitude d'écrire du HTML
      // à la main si près d'elles.
      const texte = document.createElement("span");
      texte.className = "clt-maj-texte";
      texte.textContent = "\u21bb Nouvelle version disponible";
      const note = document.createElement("span");
      note.className = "clt-maj-note";
      note.textContent = "Terminez votre saisie avant de mettre \u00e0 jour.";
      const ok = document.createElement("button");
      ok.type = "button";
      ok.className = "clt-maj-ok";
      ok.textContent = "Mettre \u00e0 jour";
      ok.addEventListener("click", function () { location.reload(); });
      const plusTard = document.createElement("button");
      plusTard.type = "button";
      plusTard.className = "clt-maj-plus-tard";
      plusTard.setAttribute("aria-label", "Plus tard");
      plusTard.title = "Plus tard";
      plusTard.textContent = "\u00d7";
      plusTard.addEventListener("click", function () {
        bandeau.hidden = true;
        marquerCorps(false);
        masqueJusqua = Date.now() + DELAI_REPORT;
      });
      var quoi = document.createElement("button");
      quoi.type = "button";
      quoi.className = "clt-maj-quoi";
      quoi.textContent = "Quoi de neuf ?";
      quoi.addEventListener("click", function () { cltAfficherNouveautes(); });
      bandeau.appendChild(texte);
      bandeau.appendChild(note);
      bandeau.appendChild(quoi);
      bandeau.appendChild(ok);
      bandeau.appendChild(plusTard);
      // Le bandeau vit en bas de l'écran depuis le 26/08/2026 (voir style.css). Sur les espaces
      // qui ont une barre d'onglets fixée en bas — livreur, client Express, coursier Express —
      // il doit se poser AU-DESSUS d'elle, sinon il masque la navigation. Même repère et même
      // méthode que le bouton « Remonter en haut », pour qu'il n'y ait qu'une chose à corriger
      // le jour où une page gagne ou perd sa barre.
      if (document.querySelector(".clt-bottomnav")) bandeau.classList.add("clt-maj-bandeau--barre");
      document.body.appendChild(bandeau);
      marquerCorps(true);
      mesurerBandeau();
      // La hauteur change quand l'écran tourne ou que la police grossit. On resuit.
      if (window.ResizeObserver) {
        try { new ResizeObserver(mesurerBandeau).observe(bandeau); } catch (e) {}
      } else {
        window.addEventListener("resize", mesurerBandeau);
      }
    }

    function verifier() {
      if (navigator.onLine === false) return;
      if (Date.now() < masqueJusqua) return;
      derniereVerif = Date.now();
      fetch(urlRepere, { cache: "no-store" })
        .then(function (r) { return r && r.ok ? r.json() : null; })
        .then(function (data) {
          const etiquetteServeur = data && typeof data.version === "string" ? data.version : "";
          if (cltDoitPrevenirMaj(etiquetteLocale, etiquetteServeur)) poser();
        })
        .catch(function () { /* injoignable ou illisible : on se tait */ });
    }

    setInterval(verifier, DELAI_FOND);

    // Le cas le plus fréquent sur téléphone : l'application est restée ouverte en arrière-plan
    // toute la nuit, on la reprend le matin. Les minuteries d'un onglet endormi sont ralenties
    // par le système ; le retour à l'écran est le moment le plus sûr pour regarder.
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - derniereVerif < DELAI_RETOUR) return;
      verifier();
    });
  } catch (err) { /* dégradation silencieuse : l'absence du bandeau ne casse rien */ }
})();


/* L'ÉCRAN « PAS DE RÉSEAU ». (07/09/2026, feuille de route 1.6)
   Posé sous la barre du haut quand le profil ne peut être lu faute de réseau et qu'aucune copie
   n'existe sur l'appareil. La session reste ; « Réessayer » recharge. Le livreur a sa propre
   copie (afficherSansReseau dans livreur.html) ; celle-ci sert aux autres espaces. */
function afficherSansReseauCLT() {
  const bloc = document.createElement('div');
  bloc.className = 'sans-reseau';
  bloc.innerHTML = '<div class="sans-reseau__icone">📵</div>'
    + '<div class="sans-reseau__titre">Pas de réseau</div>'
    + "<div class=\"sans-reseau__texte\">Impossible de vérifier votre compte pour l'instant. Vous n'êtes pas déconnecté : dès que la connexion revient, appuyez sur Réessayer.</div>"
    + '<button type="button" class="btn sans-reseau__bouton">Réessayer</button>';
  bloc.querySelector('button').addEventListener('click', function () { window.location.reload(); });
  const barre = document.querySelector('.topbar');
  if (barre) barre.insertAdjacentElement('afterend', bloc); else document.body.prepend(bloc);
}


/* UN CHAMP DE RECHERCHE SUR N'IMPORTE QUELLE LISTE. (10/09/2026)
   Celtis : « partout où il y a des listes, il faudrait un champ de recherche — au volet Comptes,
   tous les comptes sont là mais il faut faire défiler jusqu'à trouver la personne. »

   cltBrancherFiltreListe(champ, liste) filtre les lignes de `liste` (ses enfants directs) sur le
   texte tapé dans `champ` : une ligne dont le texte ne contient pas chaque mot tapé est cachée.
   Accents et majuscules ne comptent pas (« awa » trouve « Awa », « cote » trouve « Côte »). La
   liste peut être redessinée par la page à tout moment (temps réel) : un observateur réapplique
   le filtre à chaque changement, sans que la page ait à y penser. Quand rien ne correspond, une
   ligne le dit, avec les mots tapés. */
function cltNormaliserTexte(texte) {
  return String(texte === null || texte === undefined ? '' : texte)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
function cltBrancherFiltreListe(champ, liste, options) {
  if (!champ || !liste || liste.dataset.cltFiltreBranche === '1') return;
  liste.dataset.cltFiltreBranche = '1';
  const o = options || {};
  const selecteur = o.lignes || ':scope > *';
  let enCours = false;
  const appliquer = () => {
    if (enCours) return;
    enCours = true;
    try {
      const mots = cltNormaliserTexte(champ.value).split(' ').filter(Boolean);
      let visibles = 0, lignes = 0;
      liste.querySelectorAll(selecteur).forEach(ligne => {
        // Ni la ligne « aucun résultat », ni un état vide, ni un bouton (« Charger plus ») : ce ne
        // sont pas des lignes de la liste.
        if (ligne.classList.contains('clt-filtre-vide') || ligne.classList.contains('empty-state') || ligne.tagName === 'BUTTON' || ligne.classList.contains('load-more-row')) return;
        lignes++;
        const texte = cltNormaliserTexte(ligne.textContent);
        const ok = mots.every(m => texte.indexOf(m) !== -1);
        ligne.hidden = !ok;
        if (ok) visibles++;
      });
      let vide = liste.querySelector(':scope > .clt-filtre-vide');
      if (mots.length && lignes && !visibles) {
        if (!vide) { vide = document.createElement('div'); vide.className = 'empty-state clt-filtre-vide'; liste.appendChild(vide); }
        vide.textContent = 'Aucun résultat pour « ' + champ.value.trim() + ' ».';
      } else if (vide) {
        vide.remove();
      }
    } finally { enCours = false; }
  };
  champ.addEventListener('input', appliquer);
  champ.addEventListener('search', appliquer);
  if (typeof MutationObserver === 'function') {
    new MutationObserver(() => { if (champ.value.trim()) appliquer(); }).observe(liste, { childList: true });
  }
  appliquer();
}

/* ==========================================================================================
   JOINDRE CLT — 17 septembre 2026
   ==========================================================================================
   L'inventaire du 17 septembre a trouvé qu'aucun numéro de CLT n'était joignable depuis
   l'espace de la cliente ni depuis la page de suivi que voit le destinataire : le seul numéro
   affiché était celui du livreur, et seulement une fois qu'un livreur était assigné. Quelqu'un
   qui a un problème avec son colis n'avait donc personne à appeler.

   Les deux numéros sont ceux déjà publiés sur le site (page Contact et accueil) : on ne fait
   pas connaître un troisième numéro au public. Ils sont écrits ici, une seule fois pour toute
   l'application ; la page suivi.html, qui est publique et ne charge aucun script de l'app,
   porte sa propre copie — les deux doivent rester d'accord.
   ========================================================================================== */
/* Les deux lignes du service à la clientèle, données par Celtis le 17/09/2026, dans SON ordre :
   on appelle la première ; la seconde est là pour quand la première ne répond pas. Ce ne sont
   pas les numéros du site vitrine (accueil et page Contact) : ceux-là amènent un prospect au
   commercial, ceux-ci amènent une cliente ou un destinataire à la personne qui suit les colis.
   WhatsApp part sur la première ligne, la principale. */
const CLT_CONTACT = {
  tel: '+2250779604761',        // premier : 07 79 60 47 61  — APPEL
  telSecond: '+2250170407312',  // second  : 01 70 40 73 12  — APPEL
  /* WhatsApp est une LIGNE À PART, et ce n'est pas l'une des deux ci-dessus (Celtis, 17/09/2026 :
     « le numéro WhatsApp reste le même, les deux numéros que j'ai donnés sont pour les appels
     directs »). C'est le 05 46 81 86 40, celui qu'affiche déjà le site public depuis toujours :
     écrire à un numéro qui ne reçoit pas WhatsApp, c'est un message qui n'arrive jamais. */
  whatsapp: '2250546818640',    // 05 46 81 86 40 — la ligne WhatsApp du site
  afficheWhatsapp: '05 46 81 86 40',
  affiche: '07 79 60 47 61',
  afficheSecond: '01 70 40 73 12',
};

// Le lien d'appel, en toutes lettres, vers la première ligne.
function cltJoindreLienHTML(libelle) {
  return '<a class="clt-joindre" href="tel:' + CLT_CONTACT.tel + '">📞 '
    + escapeHTML(libelle || 'Joindre CLT') + '</a>';
}

/* Les boutons de contact, côte à côte : les deux lignes puis WhatsApp. `message` pré-remplit le
   message WhatsApp (le numéro du colis, par exemple) pour que la personne n'ait rien à taper
   et que l'équipe sache tout de suite de quel colis on parle. */
function cltContactBoutonsHTML(message) {
  const wa = 'https://wa.me/' + CLT_CONTACT.whatsapp
    + (message ? '?text=' + encodeURIComponent(message) : '');
  return '<div class="clt-contact">'
    + '<a class="btn btn-outline btn-sm" href="tel:' + CLT_CONTACT.tel + '">📞 ' + CLT_CONTACT.affiche + '</a>'
    + '<a class="btn btn-outline btn-sm" href="tel:' + CLT_CONTACT.telSecond + '">📞 ' + CLT_CONTACT.afficheSecond + '</a>'
    + '<a class="btn btn-outline btn-sm" href="' + wa + '" target="_blank" rel="noopener">🟢 WhatsApp ' + CLT_CONTACT.afficheWhatsapp + '</a>'
    + '</div>';
}

/* Les liens « Appeler CLT » / « Écrire sur WhatsApp » posés dans un menu : la page écrit les
   deux entrées, celle-ci leur donne leur adresse. Ainsi les numéros ne sont écrits qu'à un seul
   endroit (CLT_CONTACT ci-dessus), et un espace qui veut ces entrées n'a qu'à reprendre les
   deux identifiants. Se branche seule au chargement. */
function cltBrancherContact() {
  const tel = document.getElementById('lien-appeler-clt');
  if (tel) { tel.setAttribute('href', 'tel:' + CLT_CONTACT.tel); tel.textContent = '📞 Appeler CLT · ' + CLT_CONTACT.affiche; }
  const tel2 = document.getElementById('lien-appeler-clt-2');
  if (tel2) { tel2.setAttribute('href', 'tel:' + CLT_CONTACT.telSecond); tel2.textContent = '📞 Autre ligne · ' + CLT_CONTACT.afficheSecond; }
  const wa = document.getElementById('lien-whatsapp-clt');
  if (wa) { wa.setAttribute('href', 'https://wa.me/' + CLT_CONTACT.whatsapp); wa.textContent = '🟢 Écrire sur WhatsApp · ' + CLT_CONTACT.afficheWhatsapp; }
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cltBrancherContact);
  else cltBrancherContact();
}

/* ==========================================================================================
   INSTALLER L'APPLICATION — sans attendre le Play Store (17/09/2026, point 6.2)
   ==========================================================================================
   L'application est une PWA depuis le début : chaque espace a son manifeste et son icône, et
   tout navigateur moderne sait la poser sur l'écran d'accueil. Personne ne le savait. Le compte
   Play d'entreprise demande un numéro D-U-N-S qui peut prendre trente jours ; l'équipe, les
   livreurs et les clientes n'ont pas à attendre ce délai pour avoir l'icône sur leur téléphone.

   Ce bloc fait trois choses :
     • il retient l'offre d'installation du navigateur (beforeinstallprompt), que Chrome émet une
       seule fois et qui est perdue si personne ne l'attrape ;
     • il ajoute « 📲 Installer l'application » au menu ☰ de l'espace ouvert, et l'efface dès que
       l'application EST installée (rien de plus agaçant qu'un bouton qui ne sert plus) ;
     • il renvoie vers /installer.html quand le navigateur n'offre rien de lui-même — c'est le
       cas de l'iPhone, où l'installation passe par « Partager » puis « Sur l'écran d'accueil ».
   ========================================================================================== */
let CLT_OFFRE_INSTALL = (typeof window !== 'undefined' && window.__cltOffreInstallTot) || null;

function cltDejaInstallee() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: minimal-ui)').matches
      || window.navigator.standalone === true;
  } catch (e) { return false; }
}
function cltEstIOS() {
  const ua = navigator.userAgent || '';
  // iPadOS 13+ se présente comme un Mac : le tactile le trahit.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
/* Vrai quand on peut proposer l'installation : soit le navigateur a fait son offre, soit on est
   sur iPhone où il n'y a pas d'offre mais une marche à suivre. Dans les deux cas, pas si c'est
   déjà fait. */
function cltPeutProposerInstall() {
  return !cltDejaInstallee() && (!!CLT_OFFRE_INSTALL || cltEstIOS());
}
/* Un appui sur le bouton. Rend 'acceptee', 'refusee', 'guide' (on a ouvert la marche à suivre)
   ou 'deja'. Le navigateur ne rend son offre qu'une fois : on l'oublie après usage. */
async function cltInstaller() {
  if (cltDejaInstallee()) return 'deja';
  if (CLT_OFFRE_INSTALL) {
    const offre = CLT_OFFRE_INSTALL;
    CLT_OFFRE_INSTALL = null;
    offre.prompt();
    let choix = null;
    try { choix = await offre.userChoice; } catch (e) { /* le navigateur a fermé la fenêtre */ }
    cltMajBoutonInstall();
    return (choix && choix.outcome === 'accepted') ? 'acceptee' : 'refusee';
  }
  window.open('/installer.html', '_blank', 'noopener');
  return 'guide';
}

function cltMajBoutonInstall() {
  const montrer = cltPeutProposerInstall();
  const b = document.getElementById('btn-installer-app');
  if (b) b.classList.toggle('hidden', !montrer);
  // Sur la page de connexion, le bouton vit dans un encadré avec son explication : c'est
  // l'encadré entier qui doit disparaître une fois l'application installée.
  const bloc = document.getElementById('bloc-installer');
  if (bloc) bloc.classList.toggle('hidden', !montrer);
}

/* Pose l'entrée dans le menu ☰ de la page, si elle a un menu : dans le groupe « Outils » quand
   il existe, sinon dans un groupe à elle, juste avant la déconnexion. Les six espaces partagent
   la même structure de menu : on n'a donc rien à écrire dans chaque page. */
function cltBrancherInstall() {
  if (typeof document === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();          // sinon Chrome affiche sa propre barre, hors de notre écran
    CLT_OFFRE_INSTALL = e;
    cltMajBoutonInstall();
  });
  window.addEventListener('appinstalled', () => { CLT_OFFRE_INSTALL = null; cltMajBoutonInstall(); });

  const brancher = (bouton) => bouton.addEventListener('click', async () => {
    const r = await cltInstaller();
    if (r === 'acceptee' && typeof cltToast === 'function') cltToast("L'application est sur votre écran d'accueil.", { type: 'success', title: 'Installée' });
  });

  // La page écrit elle-même son bouton (page de connexion) : on se contente de le brancher.
  const dejaLa = document.getElementById('btn-installer-app');
  if (dejaLa) { brancher(dejaLa); cltMajBoutonInstall(); return; }

  const menu = document.getElementById('settings-dropdown');
  if (!menu) return;
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.id = 'btn-installer-app';
  bouton.className = 'hidden';
  bouton.textContent = "📲 Installer l'application";
  brancher(bouton);
  const groupes = [...menu.querySelectorAll('.settings-groupe')];
  const outils = groupes.find((g) => /Outils/i.test((g.querySelector('.settings-groupe-titre') || {}).textContent || ''));
  if (outils) outils.appendChild(bouton);
  else {
    const g = document.createElement('div');
    g.className = 'settings-groupe';
    g.appendChild(bouton);
    menu.insertBefore(g, groupes.length ? groupes[groupes.length - 1] : null);
  }
  cltMajBoutonInstall();
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cltBrancherInstall);
  else cltBrancherInstall();
}
