/* ESPACE ÉQUIPE — 05-liste-et-comptes — Le rendu de la liste des colis (une fois par image, jamais sous les doigts), les filtres, la fiche et la correction d'un compte.
   Sorti de equipe.html le 16 septembre 2026 (feuille de route 4.8, séances 3 et 4), sans retouche :
   les onze fichiers app/equipe/*.js sont chargés dans l'ordre de leur numéro, à la place de
   l'ancien script inline, et partagent les mêmes globales (scripts classiques). */
// ---------- Redessiner la liste : une seule fois par image, pas une fois par événement ----------
// Redessiner coûte cher quand la liste est longue, et les demandes arrivent souvent en rafale :
// le temps réel annonce trois colis d'un coup, une action met à jour l'état local puis la liste,
// un chargement complémentaire arrive… Chaque demande refaisait alors tout le travail, pour un
// résultat que personne n'a le temps de voir. renderColis() se contente désormais de NOTER qu'un
// rendu est attendu ; le dessin réel a lieu une seule fois, juste avant le prochain
// rafraîchissement de l'écran. Ce qui s'affiche est identique — seul le travail perdu disparaît.
// Attention au piège de l'onglet en arrière-plan : il ne reçoit PAS d'image, donc
// requestAnimationFrame seul y resterait en attente indéfiniment et la liste ne serait jamais
// reconstruite. Ça semble sans conséquence — personne ne regarde — sauf que du code LIT la liste :
// un clic sur une notification cherche la carte du colis pendant quelques secondes, et l'app peut
// très bien s'ouvrir dans un onglet d'arrière-plan. D'où le filet de sécurité ci-dessous : le
// premier des deux déclencheurs dessine, l'autre ne fait rien. Onglet visible, c'est l'image
// (≈16 ms, invisible à l'œil) ; onglet caché, c'est le minuteur. Dans les deux cas, une rafale
// d'événements ne produit qu'un seul dessin — c'est tout l'intérêt.
let colisRenduEnAttente = false;

// ---------- Ne jamais redessiner sous les doigts de quelqu'un ----------
// Ajout du 25/08/2026, après une vidéo où l'on voit une adresse à moitié tapée disparaître d'un
// coup : la liste s'était reconstruite pendant la frappe (temps réel, ou le filet de sécurité des
// 25 secondes). Le travail était à refaire, et — plus grave — sans qu'on comprenne pourquoi.
//
// La règle est simple : ON REDESSINE TOUJOURS, SAUF QUAND QUELQU'UN ÉCRIT. Ce n'est pas la fin du
// rafraîchissement automatique — les nouveaux colis continuent d'arriver tout seuls, comme
// demandé. C'est seulement qu'un rendu qui tomberait au mauvais moment attend son tour : la
// demande reste armée (`colisRenduEnAttente` n'est pas remis à faux), un compteur orange apparaît
// sur le bouton d'actualisation du haut pour dire « il y a du nouveau à voir », et le dessin part
// dès que la saisie est finie — ou dès qu'on appuie sur le bouton.
//
// « Quelqu'un écrit » veut dire ici UNE seule chose, très précise : le curseur est dans un champ
// de la liste des colis. Rien de plus, et c'est délibéré.
//
// On pourrait être tenté d'ajouter « ou bien une fiche de modification est ouverte »
// (`window.__colisEditing`). Ce serait une faute : c'est le fait d'ouvrir la fiche qui DEMANDE le
// redessin — le bouton « Modifier » ajoute l'identifiant à cet ensemble puis appelle renderColis().
// La fiche empêcherait donc son propre affichage, et le bouton « Modifier » ne ferait plus rien.
//
// Ce qu'on perdrait ainsi — une fiche ouverte, déjà corrigée, mais sans curseur dedans parce
// qu'on a posé le téléphone — est couvert deux fois par ailleurs : cltDifferSiSaisie() met en
// attente les rechargements de fond dès qu'un champ diffère de sa valeur d'origine (voir
// config.js), et eqPhotographierSaisies() ci-dessous repose les valeurs tapées si un redessin a
// tout de même lieu. Cette garde-ci est la troisième épaisseur, pas la seule.
function eqSaisieEnCours(){
const liste = document.getElementById('colis-list');
// Depuis le 10/09/2026, la même règle que config.js : le curseur ne compte que si le champ a été
// touché récemment. Sur iPhone il reste dans le dernier champ écrit après « Enregistrer », et la
// liste ne se redessinait plus jamais toute seule.
if (typeof cltChampActifRecent === 'function') return !!(liste && cltChampActifRecent(liste));
const actif = document.activeElement;
if (!actif) return false;
const balise = (actif.tagName || '').toLowerCase();
if (balise !== 'input' && balise !== 'select' && balise !== 'textarea') return false;
return !!(liste && liste.contains(actif));
}

let eqRenduDiffere = false;
let eqRendusRetenus = 0;
// Posé par le bouton « Actualiser » (10/09/2026) : le prochain dessin part quoi qu'il arrive,
// même si un champ a encore le curseur — c'est la personne qui l'a demandé.
let eqForcerProchainRendu = false;

function eqDessinerColisUneFois(){
if (!colisRenduEnAttente) return;
// On garde la demande en attente : elle repartira au `focusout` ou au bouton du haut.
if (!eqForcerProchainRendu && eqSaisieEnCours()) {
// Le compteur compte des MISES À JOUR, pas des tentatives de dessin. Une même demande est
// examinée deux fois (l'image puis le minuteur de secours, voir plus haut) : l'incrémenter à
// chaque passage afficherait « 2 » pour un seul colis reçu, et personne ne comprendrait
// pourquoi le chiffre grimpe tout seul. On ne compte donc que la PREMIÈRE mise de côté ;
// les mises à jour suivantes sont comptées dans renderColis(), à leur arrivée.
if (!eqRenduDiffere) {
eqRenduDiffere = true;
eqRendusRetenus++;
if (window.CLTActualiser) CLTActualiser.signalerEnAttente(eqRendusRetenus);
}
// La LISTE attend, pas le reste. Les récapitulatifs, la comptabilité, l'essentiel et les colis
// qui dorment ne contiennent aucune saisie : ils se redessinent tout de suite, avec les données
// fraîches. (10/09/2026 — jusque-là ils attendaient avec la liste, et sur téléphone ils
// attendaient jusqu'à la fermeture de l'application.)
eqDessinerAnnexes();
return;
}
colisRenduEnAttente = false;
eqRenduDiffere = false;
eqRendusRetenus = 0;
eqForcerProchainRendu = false;
if (window.CLTActualiser) CLTActualiser.viderAttente();
eqDessinerColis();
}

// Appelé quand la saisie se termine : curseur qui quitte un champ, fiche de modification refermée,
// enregistrement réussi. Si un rendu attendait son tour, il part maintenant.
function eqRelacherRenduDiffere(){
if (!eqRenduDiffere || eqSaisieEnCours()) return;
eqDessinerColisUneFois();
}

function renderColis(){
if (colisRenduEnAttente) {
if (eqRenduDiffere) {
if (eqSaisieEnCours()) {
// Une nouvelle mise à jour arrive pendant qu'on écrit : elle rejoint celles qui patientent,
// et le chiffre du bouton monte d'une unité. C'est ici qu'on les compte, à leur arrivée.
eqRendusRetenus++;
if (window.CLTActualiser) CLTActualiser.signalerEnAttente(eqRendusRetenus);
} else {
// La saisie vient de se terminer — c'est le cas quand on referme une fiche de modification,
// qui appelle renderColis() après avoir vidé `__colisEditing`. Sans ce rattrapage, refermer
// la fiche ne redessinerait rien et l'écran resterait figé sur l'ancienne version.
eqRelacherRenduDiffere();
}
}
return;
}
colisRenduEnAttente = true;
if (typeof requestAnimationFrame === 'function') requestAnimationFrame(eqDessinerColisUneFois);
setTimeout(eqDessinerColisUneFois, 200);
}

// ---------- Deuxième filet : sauver ce qui est écrit quand le dessin a quand même lieu ----------
// La garde ci-dessus empêche l'immense majorité des rendus malvenus. Mais elle ne peut pas tout :
// un rendu peut partir légitimement (personne ne tape à cet instant précis) alors qu'une fiche de
// modification contient déjà des valeurs corrigées mais pas encore enregistrées. Reconstruire le
// HTML les remettrait aux valeurs de la base — c'est-à-dire aux anciennes.
// On photographie donc les champs avant, on les repose après. Même principe que chez le livreur.
const EQ_CHAMPS_EDITION = ['.edit-commune-dest', '.edit-dest', '.edit-tel-destinataire',
'.edit-commune-recup', '.edit-adresse-recup', '.edit-montant-article', '.edit-montant-livraison', '.edit-frais-expedition'];
const EQ_CASES_EDITION = ['.edit-article-non-encaisse', '.edit-livraison-payee', '.edit-frais-soldes'];

function eqPhotographierSaisies(conteneur){
const photo = {};
if (!conteneur) return photo;
const actif = document.activeElement;
conteneur.querySelectorAll('.colis-item').forEach(item => {
const id = item.dataset.id;
if (!id) return;
const champs = {};
let cible = null;
EQ_CHAMPS_EDITION.forEach(sel => {
const el = item.querySelector(sel);
if (!el) return;
champs[sel] = el.value;
if (el === actif) cible = sel;
});
EQ_CASES_EDITION.forEach(sel => {
const el = item.querySelector(sel);
if (el) champs[sel] = el.checked ? '1' : '0';
});
if (!Object.keys(champs).length) return;
const zone = (cible && actif) ? actif : null;
photo[id] = {
champs: champs,
focus: cible,
debut: zone && zone.selectionStart != null ? zone.selectionStart : null,
fin: zone && zone.selectionEnd != null ? zone.selectionEnd : null,
};
});
return photo;
}

function eqReposerSaisies(conteneur, photo){
if (!conteneur || !photo) return;
Object.keys(photo).forEach(id => {
const item = conteneur.querySelector('.colis-item[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
if (!item) return;
const p = photo[id];
EQ_CHAMPS_EDITION.forEach(sel => {
const el = item.querySelector(sel);
if (el && p.champs[sel] !== undefined && el.value !== p.champs[sel]) el.value = p.champs[sel];
});
EQ_CASES_EDITION.forEach(sel => {
const el = item.querySelector(sel);
if (el && p.champs[sel] !== undefined) el.checked = p.champs[sel] === '1';
});
if (p.focus) {
const el = item.querySelector(p.focus);
if (el) {
try { el.focus(); } catch (e) {}
if (p.debut != null) { try { el.setSelectionRange(p.debut, p.fin); } catch (e) {} }
}
}
});
}

// Les tableaux qui accompagnent la liste : alertes, récapitulatif par cliente, rapport du jour,
// comptabilité, journée en cours. Ils portent sur TOUS les colis chargés, pas seulement sur la
// tranche affichée — un colis ancien qui change de statut les modifie sans rien changer à la
// liste visible. Ils sont donc appelés dans les deux cas : quand la liste est redessinée, et
// quand elle ne l'est pas. Chacun d'eux compare avant d'écrire, de son côté.
function eqDessinerAnnexes(){
renderAlertIndicator();
renderRecapFournisseur();
renderRecapLivreur();
// Les colis qui dorment SONT dessinés ici, même section fermée, contrairement à la vue par jour
// juste en dessous. La raison est qu'ils ne coûtent aucune lecture sur la base : tout sort de
// `allColis`, déjà en mémoire. Et sans ce dessin, le compteur du titre resterait vide tant que
// personne n'ouvre la section — or c'est précisément ce compteur qui doit la faire ouvrir.
renderColisQuiDorment();
// La vue par jour n'est PAS appelée ici. Depuis le 26 août 2026 elle interroge la base pour la
// journée choisie au lieu de compter sur `allColis`, qui n'en contient qu'une partie ; la
// rappeler à chaque redessin et toutes les vingt-cinq secondes ferait payer quatre lectures à
// tout le monde, y compris à qui n'a jamais ouvert cet onglet. Elle se calcule à l'ouverture de
// l'onglet et au changement de date, comme le rapport par livreur.
renderCompta();
renderAujourdhui();
}

function eqDessinerColis(){
const list = document.getElementById('colis-list');
if (typeof groupesDeDoublons === 'function') eqDoublons = groupesDeDoublons(allColis);
const __anchor = captureScrollAnchor(list);
const __saisies = eqPhotographierSaisies(list);
let filtered = activeFilter === 'tous' ? allColis : allColis.filter(c => c.statut === activeFilter);
filtered = filtered.filter(c => matchesSearch(c, searchColis) && matchesDate(c, filtreDateColis) && matchesLivreur(c, filtreLivreurColis));
// Nombre de colis déjà chargés mais pas encore dessinés. Sert plus bas à ne pas proposer
// « Charger plus de colis » (qui va chercher de l'historique sur le serveur) tant qu'il reste
// des colis à afficher ici : deux invitations à charger en même temps, c'est déroutant.
let resteAAfficher = 0;
// Un colis coché puis supprimé, ou sorti des critères entre deux rendus, ne doit plus compter
// dans la sélection : sinon la barre annoncerait un nombre plus grand que ce qu'elle traiterait.
eqLotIds.forEach(id => { if (!filtered.some(c => c.id === id)) eqLotIds.delete(id); });
list.classList.toggle('lot-actif', eqLotActif);
// __aChange dit si la liste a RÉELLEMENT changé. Quand elle n'a pas changé — c'est le cas le plus
// fréquent de très loin, puisque cette fonction est rappelée toutes les 25 secondes et à chaque
// évènement Realtime — on ne détruit rien et on ne rebranche rien. C'est ce qui fait disparaître
// le tremblement de l'écran, la perte du défilement et la perte des saisies : il n'y a plus de
// redessin du tout à ces moments-là. (25/08/2026)
let __aChange = true;
if (!filtered.length) {
__aChange = cltPoserHTML(list, (filtreLivreurColis
? `<div class="empty-state">${filtreLivreurColis === '__aucun'
? `Aucun colis en attente d'assignation${filtreDateColis ? ' à cette date' : ''}.`
: `Rien pour ${escapeHTML(livreurNomSimple(filtreLivreurColis))}${filtreDateColis ? ' à cette date' : ''}.`}</div>`
: filtreDateColis
? `<div class="empty-state">Aucun colis à cette date.</div>`
: `<div class="empty-state">Aucun colis${activeFilter !== 'tous' || searchColis ? ' pour ces critères' : ''}.</div>`)
+ (eqLotActif ? barreLotHTML(0, 0, eqBoutonsLot(), eqExtraLotHTML()) : ''), colisHasMore ? '1' : '0');
if (!__aChange) { eqDessinerAnnexes(); return; }
if (eqLotActif) eqBrancherBarreLot(list, []);
} else {
const groups = groupColisByDayAndClient(filtered, c => c.fournisseur_id, c => fournisseurLabel(c.fournisseur_id));
// On ne dessine qu'une tranche : la suite s'ajoute au défilement. Tout le reste du code
// ci-dessous continue de travailler sur `filtered`, la liste ENTIÈRE — en particulier
// l'assignation groupée d'une collecte, qui doit porter sur tous les colis concernés et pas
// seulement sur ceux visibles à l'écran.
// Exception : si on arrive par un clic sur une notification (?colis=<id>), le colis visé doit
// être dessiné même s'il se trouve loin dans la liste — sinon le clic n'amène nulle part.
const cibleLienProfond = new URLSearchParams(location.search).get('colis');
if (cibleLienProfond) {
const rangCible = rangAffichageColis(groups, cibleLienProfond);
if (rangCible >= colisTranche) colisTranche = rangCible + 1;
}
const tranche = limiterGroupesColis(groups, colisTranche);
resteAAfficher = tranche.reste;
// La barre annonce `filtered.length`, pas le nombre de lignes dessinées : « Tout sélectionner
// (312) » doit vraiment porter sur les 312 colis des critères courants.
__aChange = cltPoserHTML(list, renderGroupedColisHTML(tranche.groups, colisRowHTML, equipeCollecteActionHTML)
+ trancheColisPiedHTML(tranche.affiches, tranche.total)
+ (eqLotActif ? barreLotHTML(eqLotIds.size, filtered.length, eqBoutonsLot(), eqExtraLotHTML()) : ''),
(colisHasMore ? '1' : '0') + ':' + resteAAfficher + ':' + (colisLoadingMore ? '1' : '0'));
// Rien n'a bougé : les cartes déjà à l'écran sont les bonnes, avec leurs écouteurs, leur
// défilement et ce qui a été tapé dedans. On s'arrête là — mais on met tout de même à jour les
// tableaux annexes, qui portent sur l'ensemble des colis et pas seulement sur la tranche visible.
if (!__aChange) { eqDessinerAnnexes(); if (typeof cltAppliquerColisAVoir === 'function') cltAppliquerColisAVoir(list); return; }
if (typeof cltAppliquerColisAVoir === 'function') cltAppliquerColisAVoir(list);
brancherTrancheColis(list, () => { colisTranche += COLIS_TRANCHE; renderColis(); });
if (eqLotActif) eqBrancherBarreLot(list, filtered);

eqBrancherActionsRapides(list);

// Le champ « Précision » change de rôle quand la commune est « Expédition (intérieur) » : il
// devient LA destination (ville + gare) et non plus un repère de quartier. Le formulaire de
// création le savait déjà ; celui de MODIFICATION, non — et c'est justement là qu'on rattrape
// les colis mal adressés. Sans ce branchement, on rouvrait un colis à expédier et on lisait
// encore « Précision (quartier, repère…) », donc on écrivait « près du marché ».
list.querySelectorAll('.adresse-block').forEach(bloc => {
brancherPrecisionExpedition(bloc.querySelector('.edit-commune-dest'), bloc.querySelector('.edit-dest'));
});

list.querySelectorAll('.btn-edit-pickup').forEach(btn => {
btn.addEventListener('click', () => {
showPickupModal(btn.dataset.fournisseur);
});
});

list.querySelectorAll('.btn-assign-collecte').forEach(btn => {
btn.addEventListener('click', async () => {
const fournisseurId = btn.dataset.fournisseur;
const dayKeyVal = btn.dataset.day;
// LE BOUTON NE MARCHAIT PLUS. (09/09/2026, Celtis : « quand tu as mis le livreur et que tu
// assignes, ça ne marche pas, tu es obligé de venir sur chaque colis ».) Depuis que la liste a
// une recherche (clt-select-recherche.js), le <select> est enveloppé dans un bloc : le voisin
// du bouton n'était plus la liste, sa valeur était vide, et l'écran demandait « choisissez
// d'abord un livreur » à quelqu'un qui venait de le faire. On cherche la liste par sa classe.
const groupe = btn.closest('.group-collecte-assign');
const select = groupe ? groupe.querySelector('.select-assign-collecte') : null;
const livreur_collecte_id = select ? select.value : '';
if (!livreur_collecte_id) { cltToast("Choisissez d'abord un livreur pour la collecte.", { type: 'warning' }); return; }
const ids = filtered
.filter(c => (c.fournisseur_id || "?") === fournisseurId && c.statut === 'en_attente' && !c.livreur_collecte_id && jourDuColis(c) === dayKeyVal)
.map(c => c.id);
if (!ids.length) return;
const label = collecteLivreurLabel(livreur_collecte_id) || 'ce livreur';
if (!(await showConfirm({ title: 'Assigner la collecte ?', sub: `${label} sera chargé(e) de récupérer les ${ids.length} colis de cette cliente.`, okLabel: 'Assigner' }))) return;
const originalLabel = btn.textContent;
btn.disabled = true; btn.textContent = '...';
let { error } = await supabaseClient.from('colis').update({ livreur_collecte_id }).in('id', ids);
btn.disabled = false; btn.textContent = originalLabel;
// Coupure réseau : l'assignation est conservée sur cet appareil et repartira seule. Le livreur
// est de toute façon déjà prévenu de vive voix — perdre l'assignation obligerait à la refaire.
if (error && eqEstPanneReseau(error)) {
try {
await eqQueueAjouter({ type: 'assignation-collecte', colisIds: ids, payload: { livreur_collecte_id } });
error = null;
if (window.cltToast) cltToast("Pas de connexion : l'assignation est enregistrée sur cet appareil et partira dès le retour du réseau.", { type: 'info', duration: 7000 });
} catch (errFile) { console.error('Mise en file hors-réseau impossible :', errFile); }
}
if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); return; }
ids.forEach(id => {
const idx = allColis.findIndex(c => c.id === id);
if (idx !== -1) allColis[idx].livreur_collecte_id = livreur_collecte_id;
});
renderColis();
});
});

// Dès qu'on choisit un livreur de récupération dans la vue d'édition d'un colis bloqué,
// on débloque le bouton « Enregistrer » (et on masque le message d'aide). Si on revient à
// « — Aucun — », on rebloque.
list.querySelectorAll('.row-livreur-collecte-select').forEach(sel => {
sel.addEventListener('change', () => {
const item = sel.closest('.colis-item');
if (!item) return;
const saveBtn = item.querySelector('.btn-save');
if (!saveBtn || saveBtn.dataset.gate !== '1') return;
const hasDriver = !!sel.value;
saveBtn.disabled = !hasDriver;
const hint = item.querySelector('.save-hint');
if (hint) hint.style.display = hasDriver ? 'none' : '';
});
});

// Retour visuel immédiat : choisir un livreur de livraison fait passer la carte au bleu
// sans attendre l'enregistrement, et revenir à « — Aucun livreur — » la fait redevenir
// blanche. Purement visuel : la classe est reposée proprement par colisRowHTML() au
// prochain rendu, à partir de la valeur réellement enregistrée en base.
list.querySelectorAll('.row-livreur-select').forEach(sel => {
sel.addEventListener('change', () => {
const item = sel.closest('.colis-item');
if (item) item.classList.toggle('est-assigne', !!sel.value);
});
});

list.querySelectorAll('.btn-save').forEach(btn => {
btn.addEventListener('click', async () => {
const item = btn.closest('.colis-item');
const id = item.dataset.id;
const statut = item.querySelector('.status-select').value;
const livreurSelect = item.querySelector('.row-livreur-select');
const livreur_id = livreurSelect ? (livreurSelect.value || null) : undefined;
const livreurCollecteSelect = item.querySelector('.row-livreur-collecte-select');
const livreur_collecte_id = livreurCollecteSelect ? (livreurCollecteSelect.value || null) : undefined;
// Filet de sécurité : si l'enregistrement est bloqué (nouveau colis en attente) et qu'aucun
// livreur de récupération n'a été choisi, on n'enregistre pas.
//
// CORRECTION DU 21 AOÛT 2026 : on ne se contente plus de refuser après coup avec une fenêtre
// à fermer. Un refus qui laisse la personne chercher elle-même où cliquer coûte du temps à
// chaque colis. On amène maintenant l'écran jusqu'au champ manquant, on l'ouvre, et le message
// reste lisible à côté de lui au lieu de disparaître avec la fenêtre.
if (btn.dataset.gate === '1' && !livreur_collecte_id) {
const hint = item.querySelector('.save-hint');
if (hint) hint.style.display = '';
if (livreurCollecteSelect) {
livreurCollecteSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
try { livreurCollecteSelect.focus({ preventScroll: true }); } catch(e) { livreurCollecteSelect.focus(); }
}
if (window.cltToast) cltToast("Choisissez le livreur de récupération, juste au-dessus, puis enregistrez.", { type: 'warning' });
return;
}
const observation = item.querySelector('.obs-textarea').value.trim() || null;
const montantArticleInput = item.querySelector('.edit-montant-article');
const montantLivraisonInput = item.querySelector('.edit-montant-livraison');
const montantArticleRaw = montantArticleInput ? montantArticleInput.value.trim() : '';
const montantLivraisonRaw = montantLivraisonInput ? montantLivraisonInput.value.trim() : '';
if (montantArticleInput && !isValidMontant(montantArticleRaw === '' ? null : montantArticleRaw)) {
cltToast("Le montant article doit être un nombre positif.", { type: 'warning' });
return;
}
if (montantLivraisonInput && !isValidMontant(montantLivraisonRaw === '' ? null : montantLivraisonRaw)) {
cltToast("Le montant livraison doit être un nombre positif.", { type: 'warning' });
return;
}
const montant_article = montantArticleInput ? (montantArticleRaw === '' ? null : Number(montantArticleRaw)) : undefined;
const montant_livraison = montantLivraisonInput ? (montantLivraisonRaw === '' ? null : Number(montantLivraisonRaw)) : undefined;
const montant = (montant_article !== undefined || montant_livraison !== undefined)
? (Number(montant_article) || 0) + (Number(montant_livraison) || 0)
: undefined;
const articleNonEncaisseInput = item.querySelector('.edit-article-non-encaisse');
const livraisonPayeeInput = item.querySelector('.edit-livraison-payee');
const article_non_encaisse = articleNonEncaisseInput ? articleNonEncaisseInput.checked : undefined;
const livraison_payee = livraisonPayeeInput ? livraisonPayeeInput.checked : undefined;
// Les frais d'une expédition (10/09/2026) : le transporteur, et « frais déjà réglés » qui pose
// ou efface frais_soldes_at — la même colonne que le bouton « Soldé » du bilan et que la case de
// la cliente à la création. On ne touche à la date que si la case a changé, pour ne pas
// réécrire une date de solde ancienne.
const fraisExpInput = item.querySelector('.edit-frais-expedition');
const fraisExpRaw = fraisExpInput ? fraisExpInput.value.trim() : '';
if (fraisExpInput && !isValidMontant(fraisExpRaw === '' ? null : fraisExpRaw)) {
cltToast("Les frais d'expédition doivent être un nombre positif.", { type: 'warning' });
return;
}
const frais_expedition = fraisExpInput ? (fraisExpRaw === '' ? null : Number(fraisExpRaw)) : undefined;
const fraisSoldesInput = item.querySelector('.edit-frais-soldes');
let frais_soldes_at;
if (fraisSoldesInput) {
const colisAvant = allColis.find(x => x.id === id);
const etaitSolde = !!(colisAvant && colisAvant.frais_soldes_at);
if (fraisSoldesInput.checked !== etaitSolde) frais_soldes_at = fraisSoldesInput.checked ? new Date().toISOString() : null;
}
// Les frais additionnels (16/09/2026, chantier 3) : montant + motif libres, et une date de
// règlement qui suit la même règle que « soldé » ci-dessus — on n'y touche que si la case a
// changé, pour ne pas réécrire une date de règlement déjà posée.
const fraisAddMontantInput = item.querySelector('.edit-frais-additionnels-montant');
const fraisAddMotifInput = item.querySelector('.edit-frais-additionnels-motif');
const fraisAddRegleInput = item.querySelector('.edit-frais-additionnels-regle');
const fraisAddMontantRaw = fraisAddMontantInput ? fraisAddMontantInput.value.trim() : '';
if (fraisAddMontantInput && !isValidMontant(fraisAddMontantRaw === '' ? null : fraisAddMontantRaw)) {
cltToast('Le montant des frais additionnels doit être un nombre positif.', { type: 'warning' });
return;
}
const frais_additionnels_montant = fraisAddMontantInput ? (fraisAddMontantRaw === '' ? null : Number(fraisAddMontantRaw)) : undefined;
const frais_additionnels_motif = fraisAddMotifInput ? (fraisAddMotifInput.value.trim() || null) : undefined;
let frais_additionnels_regle_at;
if (fraisAddRegleInput) {
const colisAvant = allColis.find(x => x.id === id);
const etaitRegle = !!(colisAvant && colisAvant.frais_additionnels_regle_at);
if (fraisAddRegleInput.checked !== etaitRegle) frais_additionnels_regle_at = fraisAddRegleInput.checked ? new Date().toISOString() : null;
}
// Adresse de livraison. C'est le motif d'appel numéro un du livreur, et jusqu'ici cet écran
// ne permettait pas d'y toucher : la personne qui décroche était précisément celle qui ne
// pouvait rien corriger. Les champs ne sont envoyés que s'ils existent à l'écran, pour que
// les autres chemins d'enregistrement (lot, statut rapide) restent inchangés.
const communeDestSelect = item.querySelector('.edit-commune-dest');
const destInput = item.querySelector('.edit-dest');
const telDestInput = item.querySelector('.edit-tel-destinataire');
const commune_destination = communeDestSelect ? (communeDestSelect.value || null) : undefined;
const destination = destInput ? (destInput.value.trim() || null) : undefined;
// Le numéro du destinataire dort en base sous deux formes selon l'écran qui a créé le colis :
// « 2250546818640 » quand il vient de l'espace client, « 0546818640 » quand il vient d'ici.
// Réécrire le champ à chaque enregistrement changerait donc silencieusement des numéros que
// personne n'a touchés — et ferait apparaître une correction d'adresse dans le journal là où
// il n'y en a pas eu. On ne l'envoie que s'il a réellement été modifié.
let destinataire_telephone;
if (telDestInput) {
const telSaisi = telDestInput.value.trim();
const telOrigine = telDestInput.dataset.telOrigine || '';
const telOrigineAffiche = (typeof formatPhoneDisplay === 'function') ? formatPhoneDisplay(telOrigine) : telOrigine;
if (telSaisi === telOrigineAffiche) {
destinataire_telephone = undefined;
} else if (!telSaisi) {
destinataire_telephone = null;
} else {
let telDigits = telSaisi.replace(/[^0-9]/g, '');
if (telDigits.startsWith('225')) telDigits = telDigits.slice(3);
if (typeof isValidPhoneCI === 'function' && !isValidPhoneCI(telDigits)) {
cltToast("Le téléphone du destinataire est invalide (10 chiffres attendus, ex. 0546818640). Corrigez-le ou laissez la case vide.", { type: 'warning' });
telDestInput.focus();
return;
}
destinataire_telephone = telDigits;
}
}
// Adresse de récupération : modifiable seulement tant que le colis n'est pas parti. Une fois
// collecté, changer le point de départ ne veut plus rien dire — le champ n'est alors pas affiché.
const communeRecupSelect = item.querySelector('.edit-commune-recup');
const adresseRecupInput = item.querySelector('.edit-adresse-recup');
const commune_recuperation = communeRecupSelect ? (communeRecupSelect.value || null) : undefined;
const adresse_recuperation = adresseRecupInput ? (adresseRecupInput.value.trim() || null) : undefined;
// Transfert du colis à une autre cliente (13/09/2026). Le champ n'est envoyé que s'il a
// réellement changé, et jamais vidé : un colis sans propriétaire n'apparaîtrait chez personne.
let fournisseur_id;
{ const fournSelect = item.querySelector('.edit-fournisseur');
  if (fournSelect) {
    const choisi = fournSelect.value || '';
    const origine = fournSelect.dataset.fournisseurOrigine || '';
    if (choisi && choisi !== origine) {
      const ok = await showConfirm({
        title: 'Transférer ce colis à ' + (fournisseurLabelPlain(choisi) || 'cette cliente') + ' ?',
        detail: 'Actuellement chez ' + (fournisseurLabelPlain(origine) || 'aucune cliente'),
        sub: 'Le colis passera sur le compte de cette cliente : elle le verra dans son espace, et l\'ancienne ne le verra plus. Son relevé et les récapitulatifs suivront.',
        okLabel: 'Oui, transférer',
      });
      if (!ok) { fournSelect.value = origine; if (window.CLTRecherche) CLTRecherche.rafraichir(fournSelect); return; }
      fournisseur_id = choisi;
    }
  } }
const updatePayload = { statut, observation };
if (fournisseur_id !== undefined) updatePayload.fournisseur_id = fournisseur_id;
if (livreur_id !== undefined) updatePayload.livreur_id = livreur_id;
if (livreur_collecte_id !== undefined) updatePayload.livreur_collecte_id = livreur_collecte_id;
if (commune_destination !== undefined) updatePayload.commune_destination = commune_destination;
if (destination !== undefined) updatePayload.destination = destination;
if (destinataire_telephone !== undefined) updatePayload.destinataire_telephone = destinataire_telephone;
if (commune_recuperation !== undefined) updatePayload.commune_recuperation = commune_recuperation;
if (adresse_recuperation !== undefined) updatePayload.adresse_recuperation = adresse_recuperation;
if (montant !== undefined) updatePayload.montant = montant;
if (montant_article !== undefined) updatePayload.montant_article = montant_article;
if (montant_livraison !== undefined) updatePayload.montant_livraison = montant_livraison;
if (article_non_encaisse !== undefined) updatePayload.article_non_encaisse = article_non_encaisse;
if (frais_expedition !== undefined) updatePayload.frais_expedition = frais_expedition;
if (frais_soldes_at !== undefined) updatePayload.frais_soldes_at = frais_soldes_at;
if (frais_additionnels_montant !== undefined) updatePayload.frais_additionnels_montant = frais_additionnels_montant;
if (frais_additionnels_motif !== undefined) updatePayload.frais_additionnels_motif = frais_additionnels_motif;
if (frais_additionnels_regle_at !== undefined) updatePayload.frais_additionnels_regle_at = frais_additionnels_regle_at;
// Le jour du colis et « à livrer avant le » (09/09/2026). Un jour égal au jour de réception
// efface le report ; une date vide efface la limite.
{ const jourInput = item.querySelector('.edit-reporte-au');
  if (jourInput) { const v = String(jourInput.value || '').slice(0, 10); const colisEdite = allColis.find(x => x.id === id); const recu = colisEdite && colisEdite.created_at ? dayKey(colisEdite.created_at) : '';
    updatePayload.reporte_au = (/^\d{4}-\d{2}-\d{2}$/.test(v) && v !== recu) ? v : null; }
  const avantInput = item.querySelector('.edit-a-livrer-avant');
  if (avantInput) { const v = String(avantInput.value || '').slice(0, 10); updatePayload.a_livrer_avant = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; } }
if (livraison_payee !== undefined) updatePayload.livraison_payee = livraison_payee;
btn.disabled = true; btn.textContent = '...';
let { error } = await supabaseClient.from('colis').update(updatePayload).eq('id', id);
btn.disabled = false; btn.textContent = 'Enregistrer';
// Coupure réseau : la modification est gardée sur cet appareil. On mémorise au passage l'état
// du colis tel qu'il était à l'écran, pour détecter au retour du réseau qu'un livreur l'a
// modifié entre-temps plutôt que d'écraser son travail en silence.
if (error && eqEstPanneReseau(error)) {
try {
const vu = allColis.find(c => c.id === id);
await eqQueueAjouter({
type: 'maj-colis',
colisId: id,
payload: updatePayload,
baseUpdatedAt: vu && vu.updated_at ? vu.updated_at : null,
baseStatut: vu ? (vu.statut || null) : null
});
error = null;
if (window.cltToast) cltToast("Pas de connexion : cette modification est enregistrée sur cet appareil et partira dès le retour du réseau.", { type: 'info', duration: 7000 });
} catch (errFile) { console.error('Mise en file hors-réseau impossible :', errFile); }
}
if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); return; }
// Un transfert de cliente déplace de l'argent d'un relevé à un autre : il laisse une trace.
if (fournisseur_id !== undefined) {
  const avantColis = allColis.find(c => c.id === id);
  try {
    await supabaseClient.from('activity_log').insert([{
      action: 'correction_colis', target_id: id, target_type: 'colis',
      details: { depuis: 'fiche-modifier', numero: avantColis ? (avantColis.numero || null) : null,
        avant_fournisseur_id: avantColis ? (avantColis.fournisseur_id || null) : null, champs: { fournisseur_id } }
    }]);
  } catch (errJournal) { console.warn('Trace au journal impossible :', errJournal); }
  if (window.cltToast) cltToast('Colis transféré à ' + (fournisseurLabelPlain(fournisseur_id) || 'la cliente choisie') + '.', { type: 'success', title: "C'est fait", duration: 6000 });
}
if (window.__colisEditing) window.__colisEditing.delete(id);
// Mise à jour immédiate de l'état local + réaffichage, sans attendre l'aller-retour du temps réel :
// le colis quitte instantanément le mode édition (boutons Enregistrer/Supprimer) et repasse
// dans le menu d'actions "⋮" replié.
const idx = allColis.findIndex(c => c.id === id);
if (idx !== -1) Object.assign(allColis[idx], updatePayload);
renderColis();
// La saisie est enregistrée : la zone redevient « propre » et le rafraîchissement de fond
// qui patientait éventuellement peut repartir immédiatement.
cltSaisieEnregistree(list);
});
});

list.querySelectorAll('.btn-delete-colis').forEach(btn => {
btn.addEventListener('click', async (e) => {
e.stopPropagation();
const originalText = btn.textContent;
const item = btn.closest('.colis-item');
const id = item.dataset.id;
const colisASupprimer = allColis.find(c => c.id === id);
const okDelete = await showConfirm({
  title: 'Supprimer ce colis ?',
  // Une suppression est définitive : la boîte doit nommer le colis assez précisément
  // pour qu'on reconnaisse le bon. On donne donc les deux — où il allait ET ce qu'il
  // contenait — au lieu de choisir, comme partout ailleurs, l'un ou l'autre.
  detail: colisASupprimer
    ? [colisDestinationTexte(colisASupprimer), colisDescriptionTexte(colisASupprimer)]
        .filter(Boolean).join(' · ') || 'Colis sans destination ni description'
    : null,
  sub: 'Cette action est définitive et irréversible.',
  okLabel: 'Supprimer',
  danger: true
});
if (!okDelete) return;
btn.disabled = true; btn.textContent = '...';
const { error } = await supabaseClient.from('colis').delete().eq('id', id);
if (error) {
cltToast(friendlyErrorMessage(error.message), { type: 'error' });
btn.disabled = false; btn.textContent = originalText;
return;
}
// Retrait immédiat de la liste locale : le colis disparaît instantanément de l'écran
// au lieu d'attendre le rafraîchissement temps réel.
allColis = allColis.filter(c => c.id !== id);
if (window.__colisEditing) window.__colisEditing.delete(id);
renderColis();
});
});

list.querySelectorAll('.actions-menu-btn').forEach(btn => {
btn.addEventListener('click', (e) => {
e.stopPropagation();
const dropdown = btn.nextElementSibling;
const wasOpen = dropdown.classList.contains('open');
document.querySelectorAll('.actions-dropdown.open').forEach(d => d.classList.remove('open'));
if (!wasOpen) dropdown.classList.add('open');
});
});

list.querySelectorAll('.btn-modifier-colis').forEach(btn => {
btn.addEventListener('click', (e) => {
e.stopPropagation();
const item = btn.closest('.colis-item');
const id = item.dataset.id;
if (!window.__colisEditing) window.__colisEditing = new Set();
window.__colisEditing.add(id);
renderColis();
});
});
}

if (colisHasMore && !resteAAfficher) {
list.insertAdjacentHTML('beforeend', `
<div class="load-more-row" style="text-align:center; padding:12px 0;">
<div style="font-size:13px; color:var(--muted); margin-bottom:8px;">Historique partiel : d'autres colis plus anciens restent à charger.</div>
<button type="button" class="btn btn-outline btn-sm" id="btn-load-more-colis" ${colisLoadingMore ? 'disabled' : ''}>${colisLoadingMore ? 'Chargement…' : 'Charger plus de colis'}</button>
</div>`);
const btnLoadMoreColis = document.getElementById('btn-load-more-colis');
if (btnLoadMoreColis) btnLoadMoreColis.addEventListener('click', loadMoreColis);
}

eqDessinerAnnexes();
restoreScrollAnchor(list, __anchor);
// On repose ce qui était écrit AVANT de poser la nouvelle référence de saisie, sinon les valeurs
// reposées seraient prises pour l'état initial et ne seraient plus protégées.
eqReposerSaisies(list, __saisies);
// Nouvelle référence de saisie : tout ce qui sera modifié après ce point est considéré comme
// « non enregistré » et protège la zone contre les rafraîchissements de fond (voir config.js).
cltMarquerBaseSaisie(list);
}

// Charge la première page de colis (les plus récents). Les statistiques (alertes, récap,
// rapports) portent sur les colis effectivement chargés ; tant que l'historique complet n'a
// pas été rapatrié via "Charger plus", elles peuvent ne refléter qu'un sous-ensemble récent —
// un bandeau dans l'interface l'indique tant qu'il reste des pages à charger.
let __colisIdsSeen = null;
async function loadColis(options){
const enFond = !!(options && options.enFond);
colisOffset = 0;
colisHasMore = true;
const { data, error } = await supabaseClient
.from('colis')
.select('*')
.order('created_at', { ascending: false })
.range(0, COLIS_PAGE_SIZE - 1);
if (error) { console.error(error); return; }
// Détection des nouveaux colis. Fonctionne quelle que soit la source du rafraîchissement
// (Realtime OU filet de sécurité périodique) : on notifie l'équipe pour tout colis jamais vu.
// Les colis étant triés du plus récent au plus ancien, un nouveau colis est toujours en 1re page.
if (__colisIdsSeen) {
data.filter(c => !__colisIdsSeen.has(c.id)).forEach(c => {
// Comme sur les cartes depuis le 25/08/2026 : d'abord OÙ ça va, ensuite ce que c'est.
// C'est la destination qui dit s'il faut réagir tout de suite (une expédition part à
// heure fixe de la gare), pas le contenu du carton.
showTeamToast('📦', 'Nouveau colis ajouté',
[colisDestinationTexte(c) || 'Destination à préciser', colisDescriptionTexte(c)].filter(Boolean).join(' · '), false);
});
}
__colisIdsSeen = new Set(data.map(c => c.id));
allColis = data;
colisOffset = data.length;
colisHasMore = data.length === COLIS_PAGE_SIZE;
const list = document.getElementById('colis-list');
if (enFond && list && cltDifferSiSaisie(list, renderColis)) {
// Une saisie est réellement en cours dans la liste : elle garde ses cartes (la pastille
// « Mise à jour disponible » le dit), mais tout ce qui l'entoure se met à jour maintenant.
eqDessinerAnnexes();
} else {
renderColis();
}
// Les récapitulatifs d'un jour passé lisent un cache : un colis modifié doit s'y voir aussi.
recapRechargerJoursPasses();
// Le tableau de bord des clientes lit la base pour son compte ; s'il est sous les yeux, il
// se relit maintenant (10/09/2026). Fermé, il se relira à sa prochaine ouverture, comme avant.
{ const panneauClients = document.getElementById('eqpanel-clients');
  if (enFond && panneauClients && !panneauClients.classList.contains('hidden') && window.CLTClients) CLTClients.rafraichir(); }
// Les chiffres du jour, exacts, à chaque chargement (le premier comme ceux de fond).
chargerBilanDuJour();
}

// Version « de fond » de loadColis() : c'est celle qu'utilisent Realtime, le rafraîchissement
// périodique et le retour au premier plan. Elle s'efface tant que quelqu'un est en train de
// saisir quelque chose dans la liste (livreur choisi, montant corrigé, case cochée…), et repart
// toute seule dès que la zone est de nouveau propre. Voir config.js pour le détail.
// Les appels directs à loadColis() / renderColis() faits APRÈS une action de la personne
// (enregistrement, filtre, recherche) restent volontairement immédiats.
async function loadColisEnFond(){
// On va TOUJOURS chercher les données (10/09/2026). Avant, tout le rechargement était mis en
// attente dès qu'une saisie semblait en cours dans la liste — et sur téléphone, où le curseur ne
// quitte jamais le dernier champ, plus rien n'arrivait nulle part : ni dans la liste, ni dans
// les récapitulatifs, ni dans les comptes des livreurs et des vendeuses, tous dessinés d'après
// la même liste en mémoire. Désormais la mémoire est à jour, les tableaux annexes se
// redessinent, et seule la liste des colis attend la fin d'une saisie réelle.
await loadColis({ enFond: true });
}

async function loadMoreColis(){
if (colisLoadingMore || !colisHasMore) return;
colisLoadingMore = true;
renderColis();
const { data, error } = await supabaseClient
.from('colis')
.select('*')
.order('created_at', { ascending: false })
.range(colisOffset, colisOffset + COLIS_PAGE_SIZE - 1);
colisLoadingMore = false;
if (error) { console.error(error); renderColis(); return; }
allColis = allColis.concat(data);
colisOffset += data.length;
colisHasMore = data.length === COLIS_PAGE_SIZE;
renderColis();
}

function addEquipeMsg(text, type){
document.getElementById('add-equipe-msg').innerHTML = `<div class="msg msg-${type}">${text}</div>`;
}

async function callAdminFunction(name, body){
const { data: { session } } = await supabaseClient.auth.getSession();
const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Authorization': `Bearer ${session.access_token}`,
'apikey': SUPABASE_KEY,
},
body: JSON.stringify(body),
});
const result = await res.json();
if (!res.ok) throw new Error(result.error || 'Erreur');
return result;
}

// Colonnes lues pour la liste des comptes. Les quatre dernières n'existent
// qu'une fois exécuté _sql-prive/2026-08-comptes-du-personnel.sql. Comme ce
// script se lance à la main dans le tableau de bord Supabase, l'écran peut être
// publié avant lui : on prévoit donc une lecture de repli, sinon la liste
// resterait vide sans que personne comprenne pourquoi.
const COLONNES_COMPTES_BASE = 'id, role, full_name, company_name, phone, status, created_at, suppression_demandee_at, acces_paie, acces_compta, acces_operations';
const COLONNES_COMPTES_SUSPENSION = COLONNES_COMPTES_BASE + ', suspendu_at, suspendu_motif, statut_avant_suspension';
// Passe à false si la base ne connaît pas encore les colonnes de suspension.
let suspensionDisponible = true;

// Une seule lecture, utilisée par le premier chargement comme par « charger plus ».
async function lireComptes(debut, fin){
  const requete = (colonnes) => supabaseClient
    .from('profiles')
    .select(colonnes)
    .order('role')
    .order('full_name')
    .range(debut, fin);

  if (suspensionDisponible) {
    const res = await requete(COLONNES_COMPTES_SUSPENSION);
    if (!res.error) return res;
    // Colonnes absentes : la base n'a pas encore reçu le script. On le note une
    // fois pour toutes et on continue sans la suspension plutôt que d'échouer.
    if (/column|colonne/i.test(res.error.message || '')) {
      suspensionDisponible = false;
      console.warn("Colonnes de suspension absentes : exécutez _sql-prive/2026-08-comptes-du-personnel.sql.");
    } else {
      return res;
    }
  }
  return await requete(COLONNES_COMPTES_BASE);
}

async function loadAllAccounts(){
accountsOffset = 0;
accountsHasMore = true;
const { data, error } = await lireComptes(0, ACCOUNTS_PAGE_SIZE - 1);
if (error) { console.error(error); return; }
allAccounts = data;
accountsOffset = data.length;
accountsHasMore = data.length === ACCOUNTS_PAGE_SIZE;
renderAllAccounts();
}

async function loadMoreAccounts(){
if (accountsLoadingMore || !accountsHasMore) return;
accountsLoadingMore = true;
renderAllAccounts();
const { data, error } = await lireComptes(accountsOffset, accountsOffset + ACCOUNTS_PAGE_SIZE - 1);
accountsLoadingMore = false;
if (error) { console.error(error); renderAllAccounts(); return; }
allAccounts = allAccounts.concat(data);
accountsOffset += data.length;
accountsHasMore = data.length === ACCOUNTS_PAGE_SIZE;
renderAllAccounts();
}

// « Suspendus » n'est pas un rôle mais un statut : il traverse tous les rôles.
// Il est placé en fin de liste pour ne pas laisser croire à un rôle de plus, et
// il est là parce qu'un compte suspendu qu'on oublie de réactiver est un compte
// perdu — on veut pouvoir les retrouver d'un coup d'œil.
const ACCOUNT_FILTER_LABELS = { tous: 'Tous', fournisseur: 'Clients', livreur: 'Livreurs', client_express: 'Clients Express', coursier_express: 'Coursiers Express', equipe: 'Équipe', admin: 'Admin', suspendus: 'Suspendus' };

// Libellé lisible d'un statut de compte : « valide » ne veut rien dire pour qui
// n'a pas écrit la base.
const STATUT_COMPTE_LABELS = {
  valide: 'Actif',
  en_attente: 'En attente de validation',
  rejete: 'Refusé',
  suspendu: 'Suspendu',
};
function statutCompteLabel(statut){
  return STATUT_COMPTE_LABELS[statut] || statut || '-';
}

function renderAccountFilters(){
const box = document.getElementById('account-filters');
if (!cltPoserHTML(box, Object.keys(ACCOUNT_FILTER_LABELS).map(key =>
`<div class="filter-chip ${activeAccountFilter===key?'active':''}" data-filter="${key}">${ACCOUNT_FILTER_LABELS[key]}</div>`
).join(''))) return;
box.querySelectorAll('.filter-chip').forEach(chip => {
chip.addEventListener('click', () => {
activeAccountFilter = chip.dataset.filter;
renderAccountFilters();
renderAllAccounts();
});
});
}

function accountRowHTML(a){
const isSelf = currentUser && a.id === currentUser.id;
const isOnline = window.__presenceOnlineIds && window.__presenceOnlineIds.has(a.id);
const onlineDot = `<span class="online-dot ${isOnline ? '' : 'online-dot-off'}" title="${isOnline ? 'En ligne actuellement' : 'Hors ligne'}"></span>`;
const estSuspendu = a.status === 'suspendu';
const promoteBtn = a.role === 'equipe'
? `<button type="button" class="btn-promote-admin">⭐ Promouvoir admin</button>`
: '';
// Rétrograder un administrateur en équipe. Proposé aussi pour son PROPRE compte :
// c'est la seule façon de transmettre le rôle (on nomme d'abord le successeur,
// puis on se retire). Le retrait du dernier administrateur actif est refusé par
// la base, pas par cet écran.
const demoteBtn = a.role === 'admin'
? `<button type="button" class="btn-demote-admin">↩️ Rétrograder en équipe</button>`
: '';
// Accès délégués au module Gestion (uniquement pour les comptes « équipe »).
const accesBtns = a.role === 'equipe'
? `<button type="button" class="btn-toggle-operations">${a.acces_operations ? '✅' : '⬜'} Accès Opérations (livraisons)</button>
<button type="button" class="btn-toggle-paie">${a.acces_paie ? '✅' : '⬜'} Accès Paie (RH)</button>
<button type="button" class="btn-toggle-compta">${a.acces_compta ? '✅' : '⬜'} Accès Comptabilité</button>`
: '';
const editBtn = `<button type="button" class="btn-edit-account">✏️ Corriger la fiche</button>`;
// Réinitialisation : inutile sur un compte suspendu (il ne peut pas se connecter)
// et inutile sur le sien (on change son mot de passe depuis « Mon compte »).
const resetBtn = (isSelf || estSuspendu)
? ''
: `<button type="button" class="btn-reset-account">🔑 Réinitialiser le mot de passe</button>`;
// Suspension : l'alternative mesurée à la suppression. Jamais sur son propre compte.
const suspendBtn = isSelf
? ''
: (estSuspendu
  ? `<button type="button" class="btn-reactivate-account">✅ Réactiver le compte</button>`
  : `<button type="button" class="btn-suspend-account">⏸ Suspendre le compte</button>`);
const deleteBtn = isSelf
? `<button type="button" class="btn-delete-account danger" disabled title="Vous ne pouvez pas supprimer votre propre compte">🗑 Supprimer</button>`
: `<button type="button" class="btn-delete-account danger">🗑 Supprimer</button>`;
const suspenduBadge = estSuspendu
? ' <span class="badge" style="color:#8a6100; background:#fdf0d5;">⏸ Suspendu</span>'
: '';
const suspenduDetail = estSuspendu
? '<div class="meta" style="color:#8a6100;">Suspendu' + (a.suspendu_at ? ' le ' + escapeHTML(formatDate(a.suspendu_at)) : '') + (a.suspendu_motif ? ' · Motif : ' + escapeHTML(a.suspendu_motif) : ' · Aucun motif indiqué') + '</div>'
: '';
return `
<div class="colis-item" data-id="${a.id}"${estSuspendu ? ' style="opacity:.72;"' : ''}>
<div class="info">
<div class="desc">${onlineDot}${a.full_name ? escapeHTML(a.full_name) : '(sans nom)'}${a.company_name ? ' — ' + escapeHTML(a.company_name) : ''}${isSelf ? ' <span style="color:var(--muted); font-weight:400;">(vous)</span>' : ''}${suspenduBadge}${a.suppression_demandee_at ? ' <span class="badge" style="color:#c0392b; background:#fce4e2;">🗑 Suppression demandée</span>' : ''}</div>
<div class="meta">Rôle : ${escapeHTML(roleDisplayLabel(a.role))}${a.phone ? ' · Tél : ' + escapeHTML(a.phone) : ''} · Statut : ${escapeHTML(statutCompteLabel(a.status))}${a.suppression_demandee_at ? ' · <span style="color:#c0392b;">Suppression demandée le ' + escapeHTML(formatDate(a.suppression_demandee_at)) + '</span>' : ''}</div>
${suspenduDetail}
</div>
<div class="status-col" style="width:auto; flex-direction:row; align-items:center;">
<div class="actions-menu">
<button type="button" class="actions-menu-btn" aria-label="Actions du compte">⋮</button>
<div class="actions-dropdown">
${editBtn}
${resetBtn}
${promoteBtn}
${demoteBtn}
${accesBtns}
${suspendBtn}
${deleteBtn}
</div>
</div>
</div>
</div>
`;
}

if (!window.__accountsMenuOutsideHandlerAdded) {
document.addEventListener('click', () => {
document.querySelectorAll('.actions-dropdown.open').forEach(d => d.classList.remove('open'));
});
window.__accountsMenuOutsideHandlerAdded = true;
}

function renderAllAccounts(){
// On rafraîchit la liste des identifiants en ligne juste avant d'afficher les comptes. Sans cela,
// si le chargement des comptes se termine avant la première synchronisation de présence, les points
// verts restent gris pour les personnes déjà connectées (course entre chargement et présence).
try { window.__presenceOnlineIds = new Set(Object.keys(getPresenceState())); } catch (e) { /* présence indisponible : on garde l'ensemble courant */ }
const box = document.getElementById('all-accounts-list');
// « suspendus » filtre sur le statut, les autres sur le rôle.
const filtered = activeAccountFilter === 'tous'
? allAccounts
: (activeAccountFilter === 'suspendus'
  ? allAccounts.filter(a => a.status === 'suspendu')
  : allAccounts.filter(a => a.role === activeAccountFilter));
if (!filtered.length) {
if (cltPoserHTML(box, `<div class="empty-state">${activeAccountFilter === 'suspendus' ? 'Aucun compte suspendu.' : 'Aucun compte' + (activeAccountFilter !== 'tous' ? ' pour ce rôle' : '') + '.'}</div>`, (accountsHasMore ? '1' : '0'))) appendAccountsLoadMore(box);
return;
}
// Si rien n'a changé, on ne détruit pas les lignes : leurs menus d'actions restent branchés, et
// un menu ouvert ne se referme plus tout seul au bout de vingt-cinq secondes.
if (!cltPoserHTML(box, filtered.map(accountRowHTML).join(''), (accountsHasMore ? '1' : '0'))) return;

box.querySelectorAll('.actions-menu-btn').forEach(btn => {
btn.addEventListener('click', (e) => {
e.stopPropagation();
const dropdown = btn.nextElementSibling;
const wasOpen = dropdown.classList.contains('open');
document.querySelectorAll('.actions-dropdown.open').forEach(d => d.classList.remove('open'));
if (!wasOpen) dropdown.classList.add('open');
});
});

box.querySelectorAll('.btn-promote-admin').forEach(btn => {
btn.addEventListener('click', async (e) => {
e.stopPropagation();
const item = btn.closest('.colis-item');
const id = item.dataset.id;
const account = allAccounts.find(a => a.id === id);
const okPromote = await showConfirm({
  title: 'Promouvoir au rôle administrateur ?',
  detail: account.full_name || account.phone,
  sub: "Cette personne aura alors accès à toutes les fonctions d'administration.",
  okLabel: 'Promouvoir'
});
if (!okPromote) return;
btn.disabled = true; btn.textContent = '...';
const { error } = await supabaseClient.from('profiles').update({ role: 'admin' }).eq('id', id);
if (error) {
cltToast(friendlyErrorMessage(error.message), { type: 'error' });
btn.disabled = false; btn.textContent = '⭐ Promouvoir admin';
return;
}
try {
// actor_id / actor_role sont renseignés par la base (déclencheur
// trg_journal_renseigne_auteur) : le navigateur ne peut pas signer une
// action au nom de quelqu'un d'autre.
await supabaseClient.from('activity_log').insert([{ action: 'promotion_admin', target_id: id, target_type: 'profiles', details: { full_name: account.full_name, phone: account.phone } }]);
} catch (e) { /* non bloquant */ }
await loadAllAccounts();
if (isAdmin) await loadActivityLog();
});
});

// ---- Rétrograder un administrateur en compte équipe -----------------------
// Le compte garde l'accès « Opérations » pour continuer à travailler ; c'est le
// rôle qui change, pas la place dans l'entreprise.
box.querySelectorAll('.btn-demote-admin').forEach(btn => {
btn.addEventListener('click', async (e) => {
e.stopPropagation();
const item = btn.closest('.colis-item');
const id = item.dataset.id;
const account = allAccounts.find(a => a.id === id);
const soiMeme = currentUser && id === currentUser.id;
const okDemote = await showConfirm({
  title: soiMeme ? 'Retirer VOTRE rôle administrateur ?' : 'Rétrograder cet administrateur ?',
  detail: (account && (account.full_name || account.phone)) || '',
  sub: soiMeme
    ? "Vous perdrez immédiatement l'accès à cet écran et ne pourrez plus le reprendre vous-même : il faudra qu'un autre administrateur vous le rende. Assurez-vous qu'un successeur est déjà nommé."
    : "Cette personne redevient un compte équipe et perd les fonctions d'administration. Elle garde l'accès Opérations pour continuer son travail.",
  okLabel: 'Rétrograder',
  danger: true
});
if (!okDemote) return;
btn.disabled = true; btn.textContent = '...';
const { error } = await supabaseClient
  .from('profiles')
  .update({ role: 'equipe', acces_operations: true })
  .eq('id', id);
if (error) {
// Le refus du dernier administrateur actif vient d'ici : c'est la base qui
// tranche, et son message est déjà écrit pour être lu.
cltToast(friendlyErrorMessage(error.message), { type: 'error' });
btn.disabled = false; btn.textContent = '↩️ Rétrograder en équipe';
return;
}
try {
await supabaseClient.from('activity_log').insert([{ action: 'retrogradation_admin', target_id: id, target_type: 'profiles', details: { full_name: account && account.full_name, phone: account && account.phone } }]);
} catch (e) { /* non bloquant */ }
if (soiMeme) {
cltToast("Votre rôle administrateur a été retiré. La page va se recharger.", { type: 'warning' });
window.location.reload();
return;
}
await loadAllAccounts();
if (isAdmin) await loadActivityLog();
});
});

// ---- Corriger la fiche (nom, société, téléphone) --------------------------
box.querySelectorAll('.btn-edit-account').forEach(btn => {
btn.addEventListener('click', (e) => {
e.stopPropagation();
const id = btn.closest('.colis-item').dataset.id;
showFicheModal(id);
});
});

// ---- Réinitialisation de mot de passe lancée par l'administrateur ---------
// L'administrateur ouvre la porte ; c'est la personne qui choisit son mot de
// passe, depuis son propre téléphone. Rien n'est dicté ni transmis.
box.querySelectorAll('.btn-reset-account').forEach(btn => {
btn.addEventListener('click', async (e) => {
e.stopPropagation();
const item = btn.closest('.colis-item');
const id = item.dataset.id;
const account = allAccounts.find(a => a.id === id);
const okReset = await showConfirm({
  title: 'Réinitialiser ce mot de passe ?',
  detail: (account && (account.full_name || account.phone)) || '',
  sub: "Vous n'aurez aucun mot de passe à communiquer. La personne ouvrira la page de connexion, cliquera sur « Mot de passe oublié », saisira son numéro et choisira elle-même son nouveau mot de passe. Assurez-vous d'abord de savoir à qui vous parlez.",
  okLabel: 'Réinitialiser'
});
if (!okReset) return;
btn.disabled = true; btn.textContent = '...';
try {
const res = await callAdminFunction('admin-lancer-reset', { user_id: id });
const minutes = (res && res.minutes) || 30;
const qui = (res && (res.full_name || res.phone)) || (account && account.full_name) || 'cette personne';
cltToast(`C'est ouvert pour ${qui}.\n\nDites-lui d'aller sur la page de connexion, de cliquer sur « Mot de passe oublié », d'entrer son numéro et de choisir son nouveau mot de passe.\n\nElle a ${minutes} minutes. Passé ce délai, il faudra recommencer.`, { type: 'success', duration: 9000 });
if (isAdmin) await loadActivityLog();
} catch (err) {
cltToast(friendlyErrorMessage(err.message), { type: 'error' });
}
btn.disabled = false; btn.textContent = '🔑 Réinitialiser le mot de passe';
});
});

// ---- Suspendre / réactiver -------------------------------------------------
box.querySelectorAll('.btn-suspend-account').forEach(btn => {
btn.addEventListener('click', async (e) => {
e.stopPropagation();
const item = btn.closest('.colis-item');
const id = item.dataset.id;
const account = allAccounts.find(a => a.id === id);
// La saisie renvoie "" si le champ est laissé vide : c'est une réponse
// valable (motif facultatif). Seul null signifie « annulé ».
const motif = await showConfirm({
  title: 'Suspendre ce compte ?',
  detail: (account && (account.full_name || account.phone)) || '',
  sub: "L'accès est coupé immédiatement : cette personne ne pourra plus se connecter. Rien n'est effacé — le compte, son historique et ses colis restent en place, et vous pourrez le réactiver quand vous voudrez.",
  okLabel: 'Suspendre',
  danger: true,
  saisie: { label: 'Motif (facultatif, visible dans la liste et le journal)', placeholder: 'Ex : absence prolongée' }
});
if (motif === null) return;
btn.disabled = true; btn.textContent = '...';
try {
await callAdminFunction('admin-suspendre-compte', { user_id: id, suspendre: true, motif });
await loadAllAccounts();
if (isAdmin) await loadActivityLog();
} catch (err) {
cltToast(friendlyErrorMessage(err.message), { type: 'error' });
btn.disabled = false; btn.textContent = '⏸ Suspendre le compte';
}
});
});

box.querySelectorAll('.btn-reactivate-account').forEach(btn => {
btn.addEventListener('click', async (e) => {
e.stopPropagation();
const item = btn.closest('.colis-item');
const id = item.dataset.id;
const account = allAccounts.find(a => a.id === id);
const avant = account && account.statut_avant_suspension;
const okReactivate = await showConfirm({
  title: 'Réactiver ce compte ?',
  detail: (account && (account.full_name || account.phone)) || '',
  sub: avant && avant !== 'valide'
    ? `Le compte retrouvera exactement le statut qu'il avait avant sa suspension : « ${statutCompteLabel(avant)} ».`
    : "La personne pourra de nouveau se connecter et retrouvera ses accès d'avant.",
  okLabel: 'Réactiver'
});
if (!okReactivate) return;
btn.disabled = true; btn.textContent = '...';
try {
await callAdminFunction('admin-suspendre-compte', { user_id: id, suspendre: false });
await loadAllAccounts();
if (isAdmin) await loadActivityLog();
} catch (err) {
cltToast(friendlyErrorMessage(err.message), { type: 'error' });
btn.disabled = false; btn.textContent = '✅ Réactiver le compte';
}
});
});

// Accès délégués : activer / retirer l'accès Paie ou Comptabilité (module Gestion).
async function toggleAcces(btn, champ, libelle){
const item = btn.closest('.colis-item');
const id = item.dataset.id;
const account = allAccounts.find(a => a.id === id);
const actif = !!(account && account[champ]);
const ok = await showConfirm({
  title: actif ? `Retirer l'accès « ${libelle} » ?` : `Donner l'accès « ${libelle} » ?`,
  detail: (account && (account.full_name || account.phone)) || '',
  sub: actif
    ? "Cette personne perdra immédiatement l'accès à cette partie du module Gestion."
    : "Cette personne pourra accéder à cette partie du module Gestion. Vous gardez le contrôle et pouvez retirer cet accès à tout moment ; toutes ses actions sont enregistrées dans le journal.",
  okLabel: actif ? 'Retirer l’accès' : 'Donner l’accès',
  danger: actif
});
if (!ok) return;
btn.disabled = true;
const { error } = await supabaseClient.from('profiles').update({ [champ]: !actif }).eq('id', id);
if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); btn.disabled = false; return; }
try {
await supabaseClient.from('activity_log').insert([{ action: (!actif ? 'acces_gestion_accorde' : 'acces_gestion_retire'), target_id: id, target_type: 'profiles', details: { champ, libelle, full_name: account && account.full_name, phone: account && account.phone } }]);
} catch (e) { /* non bloquant */ }
await loadAllAccounts();
if (isAdmin) await loadActivityLog();
}
box.querySelectorAll('.btn-toggle-operations').forEach(btn => {
btn.addEventListener('click', (e) => { e.stopPropagation(); toggleAcces(btn, 'acces_operations', 'Opérations (livraisons)'); });
});
box.querySelectorAll('.btn-toggle-paie').forEach(btn => {
btn.addEventListener('click', (e) => { e.stopPropagation(); toggleAcces(btn, 'acces_paie', 'Paie (RH)'); });
});
box.querySelectorAll('.btn-toggle-compta').forEach(btn => {
btn.addEventListener('click', (e) => { e.stopPropagation(); toggleAcces(btn, 'acces_compta', 'Comptabilité'); });
});

box.querySelectorAll('.btn-delete-account').forEach(btn => {
btn.addEventListener('click', async (e) => {
e.stopPropagation();
const item = btn.closest('.colis-item');
const id = item.dataset.id;
if (currentUser && id === currentUser.id) {
cltToast("Vous ne pouvez pas supprimer votre propre compte administrateur.", { type: 'warning' });
return;
}
const account = allAccounts.find(a => a.id === id);
const okDeleteAccount = await showConfirm({
  title: 'Supprimer ce compte ?',
  detail: account.full_name || account.phone,
  sub: 'Cette action est définitive et irréversible.',
  okLabel: 'Supprimer',
  danger: true
});
if (!okDeleteAccount) return;
btn.disabled = true; btn.textContent = '...';
try {
// Un compte lié à des colis existants ne peut pas être supprimé côté serveur tant que
// ces colis référencent son identifiant (contrainte de base de données). On vérifie
// et on traite chaque cas avant d'appeler la suppression du compte lui-même.
if (account && account.role === 'fournisseur') {
const { data: linkedColis, error: countErr } = await supabaseClient
  .from('colis').select('id').eq('fournisseur_id', id);
if (countErr) throw new Error(countErr.message || 'Erreur lors de la vérification des colis liés.');
if (linkedColis && linkedColis.length > 0) {
const okDeleteColis = await showConfirm({
  title: `Ce client a ${linkedColis.length} colis enregistré(s)`,
  detail: account.full_name || account.phone,
  sub: 'Pour supprimer ce compte, ses colis doivent aussi être supprimés définitivement. Continuer ?',
  okLabel: 'Supprimer le compte et ses colis',
  danger: true
});
if (!okDeleteColis) {
btn.disabled = false; btn.textContent = '🗑 Supprimer';
return;
}
const { error: delColisErr } = await supabaseClient.from('colis').delete().eq('fournisseur_id', id);
if (delColisErr) throw new Error(delColisErr.message || 'Erreur lors de la suppression des colis liés.');
}
} else if (account && account.role === 'livreur') {
// Pour un livreur, on préserve l'historique des colis livrés : on les désassigne
// (livreur_id = null) au lieu de les supprimer.
const { error: unassignErr } = await supabaseClient
  .from('colis').update({ livreur_id: null }).eq('livreur_id', id);
if (unassignErr) throw new Error(unassignErr.message || 'Erreur lors de la désassignation des colis liés.');
}
await callAdminFunction('admin-supprimer-compte', { user_id: id });
await loadAllAccounts();
await loadPending();
await loadFournisseurs();
await loadLivreurs();
} catch (err) {
const raw = (err && err.message) ? String(err.message) : '';
const isUnhelpful = !raw || raw === '{}' || raw === '[object Object]' || raw.toLowerCase() === 'erreur';
const msg = isUnhelpful
  ? "La suppression a échoué et le serveur n'a pas renvoyé de détail exploitable. Cela peut venir d'éléments encore liés à ce compte (colis, historique, etc.) côté serveur, ou d'une erreur technique de la fonction de suppression. Réessayez, et si le problème persiste, consultez les journaux (logs) de la fonction 'admin-supprimer-compte' dans le tableau de bord Supabase."
  : raw;
cltToast(friendlyErrorMessage(msg), { type: 'error' });
btn.disabled = false; btn.textContent = '🗑 Supprimer';
}
});
});

appendAccountsLoadMore(box);

// Les comptes viennent d'arriver : le journal peut enfin nommer ses auteurs.
// (renderActivityLog ne redessine que le journal — aucun aller-retour possible.)
if (typeof renderActivityLog === 'function' && derniereActivite.length) renderActivityLog();
}

// ---------- Correction de la fiche d'un compte ----------
// Réparer une faute de frappe sans détruire le compte. Le nom et la société
// pourraient passer par une simple mise à jour, mais le téléphone est
// l'identifiant de connexion : il vit dans l'authentification ET dans la fiche,
// et seule la fonction serveur peut toucher aux deux. Tout passe donc par elle,
// pour qu'il n'y ait qu'un seul chemin à relire.
let __ficheCompteId = null;

function showFicheModal(id){
  const a = allAccounts.find(x => x.id === id);
  if (!a) return;
  __ficheCompteId = id;
  document.getElementById('fiche-modal-sub').textContent =
    roleDisplayLabel(a.role) + (a.phone ? ' · ' + a.phone : '');
  document.getElementById('fiche-modal-nom').value = a.full_name || '';
  document.getElementById('fiche-modal-societe').value = a.company_name || '';
  document.getElementById('fiche-modal-tel').value = a.phone || '';
  // La société ne concerne que les comptes clients : l'afficher partout
  // inviterait à remplir un champ qui ne sert nulle part ailleurs.
  document.getElementById('fiche-modal-societe-box').style.display =
    (a.role === 'fournisseur') ? '' : 'none';
  document.getElementById('fiche-modal-msg').innerHTML = '';
  document.getElementById('fiche-modal-overlay').classList.remove('hidden');
}

function hideFicheModal(){
  document.getElementById('fiche-modal-overlay').classList.add('hidden');
  __ficheCompteId = null;
}

document.getElementById('fiche-modal-cancel').addEventListener('click', hideFicheModal);
document.getElementById('fiche-modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'fiche-modal-overlay') hideFicheModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('fiche-modal-overlay').classList.contains('hidden')) hideFicheModal();
});

document.getElementById('fiche-modal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!__ficheCompteId) return;
  const id = __ficheCompteId;
  const compte = allAccounts.find(x => x.id === id);
  const msg = document.getElementById('fiche-modal-msg');
  const btn = document.getElementById('fiche-modal-save');

  const nom = document.getElementById('fiche-modal-nom').value.trim();
  const tel = document.getElementById('fiche-modal-tel').value.trim();
  const societe = document.getElementById('fiche-modal-societe').value.trim();

  if (!nom) {
    msg.innerHTML = '<div class="msg msg-error">Le nom ne peut pas être vide.</div>';
    return;
  }
  if (!isValidPhoneCI(tel)) {
    msg.innerHTML = '<div class="msg msg-error">Numéro de téléphone invalide. Utilisez un numéro ivoirien à 10 chiffres (ex : 07 00 00 00 00).</div>';
    return;
  }

  // On prévient AVANT d'écrire, tant que le geste est encore annulable : la
  // personne ne pourra plus se connecter avec son ancien numéro.
  const ancienNormalise = (typeof toPhoneE164 === 'function') ? toPhoneE164(String(compte && compte.phone || '')) : (compte && compte.phone);
  const nouveauNormalise = (typeof toPhoneE164 === 'function') ? toPhoneE164(tel) : tel;
  if (ancienNormalise !== nouveauNormalise) {
    const okTel = await showConfirm({
      title: 'Changer le numéro de connexion ?',
      detail: (compte && (compte.full_name || compte.phone)) || '',
      sub: `Cette personne devra désormais se connecter avec ${nouveauNormalise}. L'ancien numéro ne fonctionnera plus. Prévenez-la.`,
      okLabel: 'Changer le numéro'
    });
    if (!okTel) return;
  }

  btn.disabled = true; btn.textContent = 'Enregistrement…';
  msg.innerHTML = '';
  try {
    const charge = { user_id: id, full_name: nom, phone: tel };
    // On n'envoie la société que pour les comptes où elle a un sens : sinon on
    // effacerait sans le vouloir une valeur qu'on n'a même pas affichée.
    if (compte && compte.role === 'fournisseur') charge.company_name = societe;
    const res = await callAdminFunction('admin-modifier-compte', charge);
    hideFicheModal();
    if (res && res.inchange) {
      // Rien à dire de plus : on referme sans faire croire à une modification.
    }
    await loadAllAccounts();
    if (typeof loadFournisseurs === 'function') { try { await loadFournisseurs(); } catch (err) { /* liste secondaire */ } }
    if (typeof loadLivreurs === 'function') { try { await loadLivreurs(); } catch (err) { /* liste secondaire */ } }
    if (isAdmin) await loadActivityLog();
  } catch (err) {
    msg.innerHTML = '<div class="msg msg-error">' + escapeHTML(friendlyErrorMessage(err.message)) + '</div>';
    btn.disabled = false; btn.textContent = 'Enregistrer';
    return;
  }
  btn.disabled = false; btn.textContent = 'Enregistrer';
});

// Ajoute, si nécessaire, le bouton "Charger plus" en bas de la liste des comptes.
function appendAccountsLoadMore(box){
if (!accountsHasMore) return;
box.insertAdjacentHTML('beforeend', `
<div class="load-more-row" style="text-align:center; padding:12px 0;">
<button type="button" class="btn btn-outline btn-sm" id="btn-load-more-accounts" ${accountsLoadingMore ? 'disabled' : ''}>${accountsLoadingMore ? 'Chargement…' : 'Charger plus de comptes'}</button>
</div>`);
const btnLoadMoreAccounts = document.getElementById('btn-load-more-accounts');
if (btnLoadMoreAccounts) btnLoadMoreAccounts.addEventListener('click', loadMoreAccounts);
}

document.getElementById('form-add-equipe').addEventListener('submit', async (e) => {
e.preventDefault();
const btn = document.getElementById('btn-submit-equipe');
btn.disabled = true; btn.textContent = 'Création...';

const full_name = document.getElementById('eq-fullname').value.trim();
const phone = document.getElementById('eq-phone').value.trim();
const password = document.getElementById('eq-password').value;

if (!isValidPhoneCI(phone)) {
addEquipeMsg("Numéro de téléphone invalide. Utilisez un numéro ivoirien à 10 chiffres (ex : 07 00 00 00 00).", "error");
btn.disabled = false; btn.textContent = 'Créer le compte équipe';
return;
}
if (password.length < 6) {
addEquipeMsg("Le mot de passe doit contenir au moins 6 caractères.", "error");
btn.disabled = false; btn.textContent = 'Créer le compte équipe';
return;
}

try {
const res = await callAdminFunction('admin-creer-equipe', { full_name, phone, password });
// Accès par défaut : un nouveau compte équipe reçoit l'accès « Opérations » afin de
// pouvoir se connecter et travailler immédiatement. Sans droit, la garde du tableau de
// bord le déconnecterait aussitôt (la connexion semblait alors « refusée »). L'admin peut
// ensuite ajuster les droits (Opérations / Paie / Comptabilité) depuis la liste des comptes.
try {
let newId = res && res.user_id;
if (!newId) {
const normPhone = (typeof toPhoneE164 === 'function') ? toPhoneE164(phone) : phone;
const { data: created } = await supabaseClient
.from('profiles').select('id').eq('phone', normPhone).eq('role', 'equipe')
.order('created_at', { ascending: false }).limit(1);
if (created && created[0]) newId = created[0].id;
}
if (newId) {
await supabaseClient.from('profiles').update({ acces_operations: true }).eq('id', newId);
}
} catch (accesErr) { console.warn('Attribution accès par défaut échouée :', accesErr); }
addEquipeMsg("Compte équipe créé avec succès. Accès Opérations activé par défaut — vous pouvez l'ajuster dans la liste des comptes.", "success");
e.target.reset();
await loadAllAccounts();
} catch (err) {
addEquipeMsg(friendlyErrorMessage(err.message), "error");
}

btn.disabled = false; btn.textContent = 'Créer le compte équipe';
});

const ACTIVITY_LABELS = {
creation_compte_equipe: "Création d'un compte équipe",
creation_compte_livreur: "Création d'un compte livreur",
inscription_fournisseur: "Inscription d'un client",
demande_reset_password: "Demande de réinitialisation de mot de passe",
lancement_reset_password: "Réinitialisation de mot de passe lancée",
suppression_compte: "Suppression d'un compte",
reinitialisation_mot_de_passe: "Réinitialisation d'un mot de passe",
promotion_admin: "Promotion au rôle administrateur",
retrogradation_admin: "Retrait du rôle administrateur",
suspension_compte: "Suspension d'un compte",
reactivation_compte: "Réactivation d'un compte",
modification_compte: "Correction d'une fiche de compte",
acces_gestion_accorde: "Accès Gestion accordé",
acces_gestion_retire: "Accès Gestion retiré",
creation_colis: "Nouveau colis ajouté",
changement_statut_colis: "Changement de statut d'un colis",
suppression_colis: "Suppression d'un colis",
correction_colis: "Correction d'un colis depuis la fiche « Son écran »",
colis_adresse_modifiee: "Correction de l'adresse d'un colis",
colis_montants_modifies: "Correction des montants d'un colis",
};

// Qui a fait l'action. actor_id est renseigné par la base depuis août 2026
// (déclencheur trg_journal_renseigne_auteur) ; les lignes plus anciennes n'ont
// pas d'auteur et il vaut mieux l'écrire que laisser deviner.
function activityAuteur(a){
  if (!a.actor_id) return '';
  const compte = allAccounts.find(x => x.id === a.actor_id);
  const nom = compte ? (compte.full_name || compte.phone) : null;
  if (nom) return 'Par ' + nom;
  // Nom introuvable. Deux causes possibles, à ne pas confondre : soit la liste
  // des comptes n'est pas encore chargée (course au démarrage), soit le compte a
  // réellement été supprimé depuis. On ne l'affirme donc que si la liste est là.
  if (!a.actor_role) return '';
  return allAccounts.length
    ? 'Par un compte ' + a.actor_role + ' (supprimé depuis)'
    : 'Par un compte ' + a.actor_role;
}

function activityRowHTML(a){
const label = ACTIVITY_LABELS[a.action] || a.action;
const d = a.details || {};
const auteur = activityAuteur(a);
const auteurHTML = auteur ? '<div class="meta">' + escapeHTML(auteur) + '</div>' : '';

if (a.action === 'creation_colis') {
return `
<div class="colis-item">
<div class="info">
<div class="desc">${escapeHTML(label)} — ${escapeHTML(d.fournisseur || 'Client inconnu')}</div>
<div class="meta">${escapeHTML(d.description || '')}</div>
${auteurHTML}
<div class="meta">${formatDate(a.created_at)}</div>
</div>
</div>
`;
}
if (a.action === 'changement_statut_colis') {
const colisDuJournal = d.commune_destination ? { commune_destination: d.commune_destination } : (allColis.find(c => c.id === (a.colis_id || d.colis_id)) || null);
const ancien = d.ancien_statut ? libelleStatut(d.ancien_statut, colisDuJournal) : '-';
const nouveau = d.nouveau_statut ? libelleStatut(d.nouveau_statut, colisDuJournal) : '-';
return `
<div class="colis-item">
<div class="info">
<div class="desc">${label} — ${d.fournisseur || 'Client inconnu'}</div>
<div class="meta">${ancien} → ${nouveau}</div>
${d.observation ? `<div class="obs-display"><strong>Observation :</strong> ${escapeHTML(d.observation)}</div>` : ''}
${auteurHTML}
<div class="meta">${formatDate(a.created_at)}</div>
</div>
</div>
`;
}
if (a.action === 'suppression_colis') {
return `
<div class="colis-item">
<div class="info">
<div class="desc">${label} — ${d.fournisseur || 'Client inconnu'}</div>
<div class="meta">${d.description || ''}${d.statut ? ' · Statut au moment de la suppression : ' + libelleStatut(d.statut, d.commune_destination ? { commune_destination: d.commune_destination } : null) : ''}</div>
${auteurHTML}
<div class="meta">${formatDate(a.created_at)}</div>
</div>
</div>
`;
}

const who = d.full_name || d.phone
? ' — ' + [d.full_name, d.phone].filter(Boolean).join(' · ')
: '';
// Précisions propres à certaines actions : sans elles, « Suspension d'un compte »
// ou « Correction d'une fiche » ne dit pas ce qui a changé.
let precision = '';
if (a.action === 'suspension_compte') {
precision = d.motif ? 'Motif : ' + d.motif : 'Aucun motif indiqué';
} else if (a.action === 'acces_gestion_accorde' || a.action === 'acces_gestion_retire') {
precision = d.libelle || d.champ || '';
} else if (a.action === 'modification_compte' && d.modifications) {
const CHAMPS = { full_name: 'Nom', phone: 'Téléphone', company_name: 'Société' };
precision = Object.keys(d.modifications).map(champ => {
const m = d.modifications[champ];
return (CHAMPS[champ] || champ) + ' : ' + (m.avant || '(vide)') + ' → ' + (m.apres || '(vide)');
}).join(' · ');
}
return `
<div class="colis-item">
<div class="info">
<div class="desc">${escapeHTML(label)}${escapeHTML(who)}</div>
${precision ? '<div class="meta">' + escapeHTML(precision) + '</div>' : ''}
${auteurHTML}
<div class="meta">${formatDate(a.created_at)}</div>
</div>
</div>
`;
}

// Le journal est gardé en mémoire pour pouvoir être RÉAFFICHÉ sans être
// rechargé. C'est nécessaire depuis qu'on y montre l'auteur : le journal et la
// liste des comptes se chargent en parallèle, et si le journal arrive le premier
// il n'a encore aucun nom à afficher. On le redessine quand les comptes arrivent.
let derniereActivite = [];

function renderActivityLog(){
const box = document.getElementById('activity-log-list');
if (!box) return;
if (!derniereActivite.length) {
cltPoserHTML(box, `<div class="empty-state">Aucune activité enregistrée.</div>`);
return;
}
// Le journal est volontairement limité aux 200 dernières activités (c'est un fil de suivi, pas
// une archive). On l'écrit à l'écran plutôt que de laisser croire que tout y figure.
cltPoserHTML(box, derniereActivite.map(activityRowHTML).join('')
+ (derniereActivite.length >= 200 ? `<div style="margin-top:8px; font-size:.9em; color:#666;">Seules les 200 activités les plus récentes sont affichées.</div>` : ''));
}

async function loadActivityLog(){
const { data, error } = await supabaseClient
.from('activity_log')
.select('*')
.order('created_at', { ascending: false })
.limit(200);
if (error) { console.error(error); return; }
derniereActivite = data || [];
renderActivityLog();
}

