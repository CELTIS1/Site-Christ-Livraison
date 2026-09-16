/* ESPACE ÉQUIPE — 06-corrections-et-tournee — Les corrections de montants et la tournée de récupération écrite la veille.
   Sorti de equipe.html le 16 septembre 2026 (feuille de route 4.8, séances 3 et 4), sans retouche :
   les onze fichiers app/equipe/*.js sont chargés dans l'ordre de leur numéro, à la place de
   l'ancien script inline, et partagent les mêmes globales (scripts classiques). */
/* ============================================================================================
   LES CORRECTIONS DE MONTANTS  (27/08/2026)
   --------------------------------------------------------------------------------------------
   Un livreur peut désormais réécrire l'article et la livraison d'un colis depuis la rue, sans
   demander la permission — parce qu'attendre un accord laisserait le relevé du soir de la
   cliente porter l'ancien chiffre, c'est-à-dire exactement le problème qu'on répare. En
   contrepartie, rien de ce qu'il écrit ne doit pouvoir passer inaperçu.

   Cette liste est cette contrepartie. Elle ne valide rien, elle rend des comptes.

   Elle lit le journal de la base, pas les colis. C'est important : le colis, lui, ne porte que
   sa valeur d'aujourd'hui — il a oublié qu'il valait 15 000 ce matin. Seul activity_log garde
   l'avant et l'après, et il est rempli par un déclencheur côté serveur
   (colis_journalise_montants), donc par un chemin qu'on ne peut pas contourner en ouvrant la
   console du navigateur.

   Le découpage des lignes et l'addition ne sont pas faits ici : correctionsMontantsDuJour(),
   dans config.js, s'en charge — comme tout ce qui compte de l'argent dans cette maison.
   ============================================================================================ */
let corrExpanded = false;
let corrSelectedDate = null;     // 'YYYY-MM-DD' ; null => aujourd'hui
let corrLignes = [];             // dernier chargement brut du journal
let corrEnCours = false;
let corrErreur = '';
let corrJourAffiche = null;      // jour dont les lignes sont à l'écran ; sert à ne pas le vider pendant un rechargement

function corrGetDate(){
return corrSelectedDate || todayLocalISODate();
}

function toggleCorrections(){
corrExpanded = !corrExpanded;
const box = document.getElementById('corr-montants');
if (corrExpanded) { expandCollapsible(box); } else { collapseCollapsible(box); }
const fleche = document.getElementById('corr-arrow');
if (fleche) fleche.textContent = corrExpanded ? '▼' : '▶';
// Le chargement n'a lieu qu'à l'ouverture, jamais au fil des redessins : c'est une lecture
// de plus sur la base, et elle ne concerne que celui qui a ouvert la section.
if (corrExpanded) { loadCorrectionsMontants(); refreshStickyTables(box); }
}

async function loadCorrectionsMontants(){
const jour = corrGetDate();
corrEnCours = true; corrErreur = '';
renderCorrectionsBody();
// Bornes de la journée LOCALE, pas UTC : à Abidjan une correction de 23 h 30 appartient au
// soir où elle a été faite, et doit sortir dans la liste de ce soir-là.
const debut = new Date(jour + 'T00:00:00');
const fin = new Date(debut.getTime() + 24 * 60 * 60 * 1000);
const { data, error } = await supabaseClient
.from('activity_log')
.select('*')
.eq('action', 'colis_montants_modifies')
.gte('created_at', debut.toISOString())
.lt('created_at', fin.toISOString())
.order('created_at', { ascending: false })
.limit(300);
corrEnCours = false;
if (error) {
console.error(error);
// On nomme la cause probable la plus fréquente au lieu d'afficher une liste vide : une liste
// vide se lit « personne n'a rien corrigé », ce qui serait faux et rassurant à tort.
corrErreur = "Impossible de lire les corrections. Si c'est la première fois, le script "
+ "_sql-prive/2026-08-montants-corriges-par-le-livreur.sql n'a peut-être pas encore été exécuté.";
corrLignes = [];
} else {
corrLignes = data || [];
}
renderCorrectionsBody();
}

// Le journal ne connaît que des identifiants. Le nom, lui, est dans allAccounts — chargé en
// parallèle, donc parfois en retard. On retombe alors sur le rôle plutôt que sur un identifiant
// technique, illisible pour la personne qui lit ce tableau à 19 h.
function corrNomActeur(id){
if (!id) return '—';
// 05/09/2026 — allAccounts n'est chargé que pour l'admin : pour l'équipe, on cherche aussi
// dans les livreurs puis les clientes, sinon la colonne restait vide.
const compte = (allAccounts || []).find(x => x.id === id)
  || (typeof livreurs !== 'undefined' ? (livreurs || []).find(x => x.id === id) : null)
  || (typeof fournisseurs !== 'undefined' ? (fournisseurs || []).find(x => x.id === id) : null);
if (compte) return compte.full_name || compte.phone || '—';
return '—';
}

function corrEcartHTML(n, label){
if (!n) return `<td data-label="${label}" style="color:#8a94a3;">—</td>`;
const couleur = n > 0 ? '#1e8f4e' : '#c0392b';
const signe = n > 0 ? '+' : '−';
return `<td data-label="${label}" style="color:${couleur}; font-weight:700;">${signe}${formatMontant(Math.abs(n))}</td>`;
}

function renderCorrectionsBody(){
const body = document.getElementById('corr-body');
if (!body) return;
const dateLabel = recapDayLabel(corrGetDate());

// « Chargement… » seulement si le jour demandé n'est pas déjà à l'écran : un rechargement du même
// jour (retour au premier plan, ouverture de l'onglet) garde le tableau et le remplace d'un coup,
// sans faire sauter la page. (11/09/2026)
if (corrEnCours && corrJourAffiche !== corrGetDate()) { cltPoserHTML(body, `<div class="empty-state">Chargement…</div>`); return; }
if (corrErreur) { cltPoserHTML(body, `<div class="empty-state">${escapeHTML(corrErreur)}</div>`); return; }
if (corrEnCours) return;
corrJourAffiche = corrGetDate();

const { lignes, total } = correctionsMontantsDuJour(
corrLignes.map(a => ({ ts: a.created_at, target_id: a.target_id, actor_id: a.actor_id, actor_role: a.actor_role, details: a.details })),
{ nomActeur: corrNomActeur }
);

if (!lignes.length) {
cltPoserHTML(body, `<div class="empty-state">Aucun montant corrigé ${dateLabel}. C'est la situation normale : les prix annoncés le matin ont tenu jusqu'au soir.</div>`);
return;
}

const rows = lignes.map(l => `
<tr>
<td data-label="Heure">${formatDate(l.ts)}</td>
<td data-label="Colis">${l.numero ? escapeHTML(l.numero) : '—'}</td>
<td data-label="Par">${escapeHTML(l.auteur)}${l.role ? ' <span class="meta">(' + escapeHTML(l.role) + ')</span>' : ''}</td>
<td data-label="Article">${l.articleTouche ? formatMontant(l.articleAvant) + ' → <strong>' + formatMontant(l.articleApres) + '</strong>' : '<span style="color:#8a94a3;">inchangé</span>'}</td>
${corrEcartHTML(l.ecartArticle, 'Écart article')}
<td data-label="Livraison">${l.livraisonTouche ? formatMontant(l.livrAvant) + ' → <strong>' + formatMontant(l.livrApres) + '</strong>' : '<span style="color:#8a94a3;">inchangé</span>'}</td>
${corrEcartHTML(l.ecartLivraison, 'Écart livraison')}
</tr>`).join('');

const signeTotal = (n) => n === 0 ? '0 FCFA' : ((n > 0 ? '+' : '−') + formatMontant(Math.abs(n)));

cltPoserHTML(body, `
<div class="recap-day-summary">${dateLabel} · <strong>${lignes.length}</strong> correction${lignes.length > 1 ? 's' : ''}</div>
<div class="recap-table-wrap">
<table class="recap-table recap-table-cards">
<thead><tr><th>Heure</th><th>Colis</th><th>Par</th><th>Article</th><th>Écart article</th><th>Livraison</th><th>Écart livraison</th></tr></thead>
<tbody>${rows}</tbody>
${piedTotalHTML([
{ texte: 'TOTAL' },
// Même raison qu'au tableau des tournées : cette cellule dit déjà ce qu'elle compte, et le
// libellé « Colis » venait de la colonne, pas du sens. On lisait « Colis : 3 correction(s) ».
{ texte: lignes.length + ' correction(s)' },
{ texte: '' },
{ texte: '' },
{ texte: signeTotal(total.ecartArticle), label: 'Écart article', couleur: total.ecartArticle > 0 ? '#1e8f4e' : (total.ecartArticle < 0 ? '#c0392b' : '') },
{ texte: '' },
{ texte: signeTotal(total.ecartLivraison), label: 'Écart livraison', couleur: total.ecartLivraison > 0 ? '#1e8f4e' : (total.ecartLivraison < 0 ? '#c0392b' : '') },
])}
</table>
</div>
<details class="eq-aide"><summary>ℹ️ Comment lire</summary><div class="recap-bilan-note">
Les deux poches sont comptées séparément, et c'est voulu : l'<strong>article</strong> appartient à la cliente,
la <strong>livraison</strong> est la recette de CLT. Additionner les deux écarts donnerait
${signeTotal(total.ecartTotal)}, un chiffre qui ne veut rien dire pour personne.
Ces corrections sont <strong>déjà enregistrées</strong> — rien n'est à approuver ici. Un écart qui
vous surprend se règle en appelant la personne qui l'a écrit, pas en le défaisant en silence.
</div></details>`);
}

/* ============================================================================================
   🗓️ LA TOURNÉE DE RÉCUPÉRATION — écrite la veille au soir. (27/08/2026)

   Le calcul n'est pas ici : il est dans config.js (tourneesDeRecuperation & co.), au même
   endroit que celui du livreur. Les deux écrans montrent la même tournée ; ils ne doivent
   donc jamais la recalculer chacun de son côté, sinon ils finiront par se contredire un jour
   où personne ne regardera.

   Cet écran-ci ne fait que : choisir la journée, aller chercher les lignes, appeler le calcul
   et l'habiller.
   ============================================================================================ */
let progJourChoisi = null;     // 'YYYY-MM-DD' ; null => demain
let progLignes = [];           // dernier chargement brut de programmations_collecte
let progColis = [];            // les colis utiles au comptage de la journée affichée
let progEnCours = false;
let progErreur = '';
let progJourAffiche = null;    // jour dont la tournée est à l'écran ; on ne la vide pas pendant un rechargement

function progGetJour(){
// D'office AUJOURD'HUI (07/09/2026, Celtis : « d'office les dates d'affichage doivent être
// celles du jour ; la tournée d'office programmée sur la date du jour »). Le bouton « Demain »
// reste, pour le soir.
return progJourChoisi || aujourdhuiAbidjan();
}

function progMsg(text, type){
const el = document.getElementById('prog-msg');
if (el) el.innerHTML = `<div class="msg msg-${type}">${escapeHTML(text)}</div>`;
if (window.cltToast) {
cltToast(text, { type: type === 'error' ? 'error' : (type === 'success' ? 'success' : 'info') });
}
}

// La fiche d'une cliente, telle que le tableau la demande. `fournisseurs` est la liste
// complète des clientes (loadFournisseurs), pas une page : on peut s'y fier.
function progFicheCliente(id){
const f = (fournisseurs || []).find(x => x.id === id);
if (!f) return {};
return {
nom: f.company_name || f.full_name || '',
commune: f.commune_recuperation || '',
adresse: f.adresse_recuperation || '',
telephone: f.phone || '',
};
}

function progNomLivreur(id){
const l = (livreurs || []).find(x => x.id === id);
return l ? (l.full_name || '') : '';
}

// Les colis nécessaires au comptage, demandés à la base et non lus dans `allColis` : ce cache
// est paginé, et un colis resté au-delà de la première page ferait afficher « rien à
// récupérer » chez une cliente qui a pourtant de la marchandise prête. Un tableau faux et
// muet, exactement ce qu'on ne veut pas.
//
// Trois questions différentes, donc trois requêtes :
//   — ce qui reste à prendre chez les clientes programmées : colis « en attente », sans date ;
//   — ce qui a déjà été pris chez elles : colis dont l'heure de récupération tombe dans la journée ;
//   — ce qui est confié à un livreur SANS qu'aucune tournée ne le porte : la troisième, ajoutée
//     le 28/08/2026, est celle qui manquait au bureau.
//
// POURQUOI LA TROISIÈME. Avant elle, l'écran du bureau ne demandait que les colis des clientes
// déjà programmées. Il ne pouvait donc pas voir ce qui traînait ailleurs, et son silence se
// lisait « il n'y a rien » — alors que le 28/08/2026 le seul compte de GONSON Christ portait
// dix clientes et trente-six colis que personne n'avait programmés. Un écran qui ne peut pas
// répondre à une question ne doit pas la poser ; celui-ci peut désormais y répondre.
//
// LA COLONNE DU RÉCUPÉRATEUR EST DEMANDÉE, ET ELLE NE L'ÉTAIT PAS. Sans elle, le calcul commun
// ne saurait à quel livreur rattacher un colis confié, et n'annoncerait rien du tout.
async function progColisPourLaTournee(jour, fournisseurIds){
if (!jour) return [];
const debut = jour + 'T00:00:00Z';
const fin   = jour + 'T23:59:59.999Z';
// collecte_depart_at depuis le 29/08/2026 : l'heure à laquelle le livreur a appuyé sur « Je pars »
// depuis son téléphone. Demandée ici, en un seul endroit, parce que les quatre questions ci-dessous
// partagent la même liste de champs — en oublier une aurait fait clignoter la marque « en route »
// selon la question qui a rapporté le colis en dernier.
// created_at et jour_recuperation_prevu depuis le 07/09/2026 : c'est ce qui dit à quel jour
// appartient un colis hors programme (colisHorsProgrammeDuJour, config.js). Si la colonne du
// jour prévu manque encore, on relit sans elle plutôt que de laisser l'onglet vide.
const CHAMPS_COMPLETS = 'id, fournisseur_id, statut, recupere_at, livreur_collecte_id, collecte_depart_at, created_at, jour_recuperation_prevu';
const CHAMPS_SANS_JOUR_PREVU = 'id, fournisseur_id, statut, recupere_at, livreur_collecte_id, collecte_depart_at, created_at';

const questions = (champs) => {
const programmees = fournisseurIds.length ? [
supabaseClient.from('colis').select(champs)
.in('fournisseur_id', fournisseurIds).eq('statut', 'en_attente'),
supabaseClient.from('colis').select(champs)
.in('fournisseur_id', fournisseurIds).gte('recupere_at', debut).lte('recupere_at', fin),
] : [];
return Promise.all(programmees.concat([
// Tout ce qui attend et qui est confié à quelqu'un, quelle que soit la cliente. Le tri entre
// « déjà programmé » et « hors programme » n'est pas fait ici : il est fait une seule fois,
// dans tourneesDeRecuperation(), pour que le bureau et le livreur trient de la même façon.
supabaseClient.from('colis').select(champs)
.eq('statut', 'en_attente').not('livreur_collecte_id', 'is', null),
// Et tout ce qui a été RÉCUPÉRÉ dans la journée, chez n'importe quelle cliente. Sans cette
// quatrième question, le bureau annonçait « 0 déjà pris » le 28/08/2026 alors que 44 colis
// avaient été ramassés chez 12 clientes : la seule question sur recupere_at était restreinte
// aux clientes programmées, et il n'y en avait que deux. Un zéro faux se lit « personne n'a
// travaillé » ; c'est la pire chose qu'un écran de bureau puisse dire.
supabaseClient.from('colis').select(champs)
.gte('recupere_at', debut).lte('recupere_at', fin),
]));
};

let reponses = await questions(CHAMPS_COMPLETS);
if (reponses.some(r => r.error && colonneAbsente(r.error))) {
console.warn("Colonne jour_recuperation_prevu absente : le script SQL du 31/08/2026 n'a pas encore été exécuté.");
reponses = await questions(CHAMPS_SANS_JOUR_PREVU);
}

const parId = new Map();
for (const { data, error } of reponses) {
if (error) { console.error('Tournée :', error.message || error); continue; }
(data || []).forEach(c => { if (c && c.id) parId.set(c.id, c); });
}
return Array.from(parId.values());
}

async function chargerProgrammations(){
const jour = progGetJour();
progEnCours = true; progErreur = '';
renderProgrammationBody();

/* L'ORDRE DE PUBLICATION NE DOIT PAS POUVOIR CAUSER UNE PANNE. (30/08/2026)

   Les deux colonnes d'annonce sont nées le 30/08/2026. Si le code part avant que le script
   _sql-prive/2026-08-30-la-cliente-annonce-ses-colis.sql ait été exécuté, PostgREST refuse la
   requête ENTIÈRE pour une colonne inconnue. Ce n'est pas la nouvelle fonction qui tombe :
   c'est tout l'onglet tournée, des deux espaces, sur des écrans qui décident de l'argent du
   soir. Une fenêtre de quelques minutes suffit à laisser un livreur sans sa tournée un matin.

   On demande donc les colonnes, et si la base ne les connaît pas encore, on redemande sans
   elles. La tournée s'affiche alors comme avant le 30 août, sans annonce — dégradée, pas
   tombée. Le jour où le script est passé, la première lecture suffit et ce filet ne sert plus.
   Il coûte une requête supplémentaire une seule fois, et seulement dans le cas où l'écran
   serait autrement inutilisable. */
const lireProgrammations = (colonnes) => supabaseClient
.from('programmations_collecte')
.select(colonnes)
.eq('jour', jour);

let { data, error } = await lireProgrammations('id, jour, fournisseur_id, livreur_id, note, nb_colis_annonce, annonce_reglee_at, nb_colis_pris, pris_confirme_at, pris_note');
if (error && colonneAbsente(error)) {
console.warn("Colonnes de confirmation absentes : le script SQL du 06/09/2026 n'a pas encore été exécuté.");
({ data, error } = await lireProgrammations('id, jour, fournisseur_id, livreur_id, note, nb_colis_annonce, annonce_reglee_at'));
}
if (error && colonneAbsente(error)) {
console.warn("Colonnes d'annonce absentes : le script SQL du 30/08/2026 n'a pas encore été exécuté.");
({ data, error } = await lireProgrammations('id, jour, fournisseur_id, livreur_id, note'));
}

if (error) {
console.error(error);
progEnCours = false;
// On nomme la cause la plus probable plutôt que de montrer un tableau vide : un tableau vide
// se lit « personne n'a rien programmé », ce qui serait faux et rassurant à tort.
progErreur = "Impossible de lire les programmations. Si c'est la première fois, le script "
+ "_sql-prive/2026-08-programmation-des-recuperations.sql n'a probablement pas encore été exécuté.";
progLignes = []; progColis = [];
renderProgrammationBody();
return;
}

progLignes = data || [];
// Une journée à venir n'a pas encore de colis : inutile d'interroger la base pour elle.
const rang = rangDeLaJournee(jour, aujourdhuiAbidjan());
progColis = rang === 'avenir'
? []
: await progColisPourLaTournee(jour, Array.from(new Set(progLignes.map(p => p.fournisseur_id))));

progEnCours = false;
renderProgrammationBody();
}

function renderProgrammationBody(){
const body = document.getElementById('prog-body');
if (!body) return;
const jour = progGetJour();

// « Chargement… » seulement quand la journée demandée n'est pas déjà à l'écran. Après « Ajouter »
// ou « Retirer », la tournée se recharge : elle reste affichée et se remplace d'un coup, au lieu
// de disparaître 200 ms et de faire sauter la page. (11/09/2026)
if (progEnCours && progJourAffiche !== jour) { cltPoserHTML(body, `<div class="empty-state">Chargement…</div>`); return; }
if (progErreur)  { cltPoserHTML(body, `<div class="empty-state">${escapeHTML(progErreur)}</div>`); return; }
if (progEnCours) return;
progJourAffiche = jour;

const tournee = tourneesDeRecuperation({
jour: jour,
aujourdHui: aujourdhuiAbidjan(),
programmations: progLignes,
colis: progColis,
cliente: progFicheCliente,
livreurNom: progNomLivreur,
// Le bureau peut désormais poser la question, parce qu'il a de quoi y répondre : depuis le
// 28/08/2026 progColisPourLaTournee() lui rapporte aussi les colis confiés sans tournée. Tant
// qu'il ne les demandait pas, il ne devait pas poser la question — zéro ligne hors programme
// se serait lu « il n'y en a pas », alors qu'il y en avait trente-six.
horsProgramme: true,
// Et le travail déjà fait. Le bureau ne demande pas « où reste-t-il à aller » — ça, c'est la
// question du téléphone du livreur, qui ne pose donc pas celle-ci. Le bureau demande « que
// s'est-il passé aujourd'hui », et une journée où tout a été ramassé n'est pas une journée vide.
travailFait: true,
});
const { lignes, total, colisConnus } = tournee;
const dateLabel = recapDayLabel(jour);

/* LES RESTES DES JOURS PASSÉS. (07/09/2026, Celtis : « chaque jour, son affichage »)
   Un colis en attente confié à un livreur un autre jour ne fait plus de carte dans la journée
   qu'on regarde. Mais une marchandise qui attend chez une cliente ne doit pas être oubliée :
   on la compte, en une ligne, pour que le bureau la reprogramme. */
const restes = tournee.restesDesJoursPasses || 0;
const ligneRestes = restes > 0
? `<div class="meta prog-restes" style="margin-top:8px; color:#b45309;">⏳ <strong>${restes}</strong> colis en attente d'un autre jour, confié${restes > 1 ? 's' : ''} à un livreur sans tournée ${escapeHTML(dateLabel)} — à reprogrammer si la récupération est encore à faire.</div>`
: '';

if (!lignes.length) {
cltPoserHTML(body, `<div class="empty-state">Aucune récupération programmée ${escapeHTML(dateLabel)}. Choisissez une cliente et un livreur ci-dessus pour commencer la tournée.</div>${ligneRestes}`);
return;
}

/* CE QUE CET ÉCRAN DOIT RÉPONDRE : « QUI VA OÙ AUJOURD'HUI ». (refondu le 28/08/2026)

   Il posait jusqu'ici une liste plate de clientes avec une colonne « Livreur ». Pour savoir ce
   que fait Koffi il fallait parcourir cette colonne des yeux et additionner de tête. Un écran
   qui oblige à additionner de tête finit toujours par produire un chiffre faux, et c'est le
   patron qui l'annonce à son livreur. On range donc par livreur, chacun avec son sous-total, et
   les sous-totaux sortent de la même addition que le TOTAL du bas — totalDesLignes(), dans
   config.js. Deux additions écrites séparément finissent toujours par diverger.

   ET C'EST LE MÊME DESSIN QUE LE TÉLÉPHONE DU LIVREUR. Le bureau et le livreur regardent la
   même journée ; ils doivent la reconnaître au premier coup d'œil. Les cartes, les couleurs de
   bordure et les boutons de contact sont ceux de app/livreur.html, définis une seule fois dans
   style.css. Quand le bureau appelle une cliente pour prévenir d'un retard, il compose le même
   numéro, mis en forme par la même fonction. */

// « à venir » et non « 0 » : tant que la journée n'est pas arrivée, aucun colis n'existe
// encore. Écrire zéro laisserait croire que la cliente n'a rien, alors qu'on n'en sait rien.
const compte = (n) => colisConnus ? String(n) : '<span style="color:#8a94a3;">à venir</span>';

/* CE QUI EST FAIT. (28/08/2026) Une cliente que personne n'avait programmée, chez qui plus rien
   n'attend, et chez qui un livreur est pourtant passé dans la journée. Ce n'est ni du programme,
   ni du reste à faire : c'est du travail accompli, et cela mérite son propre tiroir. Défini une
   seule fois ici pour que le tri des blocs, la couleur de la carte, la marque et le geste
   répondent tous à la même question — trois définitions séparées finiraient par diverger. */
const travailFini = (l) => l.horsProgramme && !l.nbAPrendre && l.nbDejaPris > 0;

const carteHTML = (l) => {
const contacts = l.telephone
? `<div class="tournee-contacts">
<a class="tournee-contact tournee-contact--appel" href="tel:${escapeHTML(numeroCompose(l.telephone))}">📞 Appeler</a>
<a class="tournee-contact tournee-contact--whatsapp" href="${escapeHTML(lienContactRecuperation(l.telephone, { livreurNom: '', commune: l.commune }))}" target="_blank" rel="noopener">💬 WhatsApp</a>
</div>`
: `<div class="tournee-contacts">
<span class="tournee-contact tournee-contact--absent">Numéro non renseigné — à compléter dans sa fiche</span>
</div>`;
/* LE LIEU MANQUANT SE CORRIGE LÀ OÙ IL MANQUE. (29/08/2026)
   Quand la commune est absente, la ligne du lieu cesse d'être une phrase et devient le geste
   qui la répare : un clic ouvre la fiche de récupération de la cliente, déjà écrite, qui
   enregistre la commune et la reporte aussitôt sur ses colis en attente. Pas de bouton
   supplémentaire — la carte resterait épurée à trois gestes, elle en aurait quatre. On répare
   l'information à l'endroit exact où on constate qu'elle manque.
   Ce geste s'affiche AUSSI sur les cartes terminées, contrairement à « Retirer de la tournée ».
   Ce n'est pas une incohérence : retirer une tournée finie n'a aucun effet utile, tandis qu'une
   fiche sans commune est fausse aujourd'hui et le sera encore demain. Chaque occasion de la
   corriger est bonne à prendre. */
const lieuTexte = libelleLieuRecuperation(l.commune, l.adresse);
const lieuManquant = communeRecuperationManquante(l.commune);
const lieuHTML = lieuManquant
? `<button type="button" class="tournee-lieu tournee-lieu--manquant" data-prog-lieu="${escapeHTML(l.fournisseurId)}">📍 ${escapeHTML(lieuTexte)} — la renseigner</button>`
: `<div class="tournee-lieu">📍 ${escapeHTML(lieuTexte)}</div>`;
const fini = travailFini(l);
const classe = fini ? 'tournee-carte--fait'
: (l.horsProgramme ? 'tournee-carte--hors'
: (l.rienARecuperer ? 'tournee-carte--rien' : 'tournee-carte--programme'));
/* TROIS SITUATIONS, TROIS GESTES — DONT UN QUI EST L'ABSENCE DE GESTE. (28/08/2026)
   Sur une ligne hors programme il n'y a aucune programmation à retirer : on propose au
   contraire d'en poser une, en pré-remplissant le formulaire du haut. Le bureau relit et
   valide lui-même — un écran ne doit pas écrire en base sur un seul clic mal placé.
   Sur un travail déjà fait, aucun des deux n'a de sens : « Retirer » n'aurait rien à retirer,
   et « Poser une tournée » proposerait d'envoyer quelqu'un là où l'on est déjà passé. Un
   bouton sans effet utile est pire qu'un bouton absent : on croit avoir agi. */
/* CHANGER LE LIVREUR SANS RETIRER PUIS REPOSER. (31/08/2026)

   Demandé par Celtis : « on peut se tromper et changer le livreur en fonction des réalités ».
   C'était déjà possible — rechoisir la même cliente avec un autre livreur écrase l'ancienne
   ligne, la table n'en accepte qu'une par (jour, cliente) — mais RIEN ne le disait. La carte
   n'offrait que « Retirer de la tournée », si bien que la seule manœuvre visible pour corriger
   un livreur était de détruire la programmation puis d'en refaire une : deux gestes, une
   fenêtre pendant laquelle la cliente n'est chez personne, et l'annonce de ses colis perdue au
   passage.

   Le geste réutilise le pré-remplissage déjà écrit pour les clientes du repli. Il n'écrit rien
   de lui-même : il remonte au formulaire, tout rempli, et c'est le bureau qui relit et valide.
   Un écran ne doit pas réaffecter un livreur sur un seul clic mal placé.

   Le nombre annoncé voyage avec, en troisième position, pour être RELU et non deviné : sans
   lui, le bureau corrigerait un livreur en voyant un champ vide, et ne saurait pas que la
   cliente avait annoncé trois colis. */
const geste = fini ? ''
: l.horsProgramme
? `<button type="button" class="btn btn-outline btn-sm tournee-geste" data-prog-programmer="${escapeHTML(l.fournisseurId)}|${escapeHTML(String(l.livreurId || ''))}">Poser une tournée pour elle</button>`
: `<button type="button" class="btn btn-outline btn-sm tournee-geste" data-prog-modifier="${escapeHTML(l.id)}" data-prog-programmer="${escapeHTML(l.fournisseurId)}|${escapeHTML(String(l.livreurId || ''))}|${escapeHTML(l.nbAnnonce === null || l.nbAnnonce === undefined ? '' : String(l.nbAnnonce))}|${escapeHTML(l.note || '')}">✏️ Modifier</button>
   <button type="button" class="btn btn-outline btn-sm tournee-geste" data-prog-retirer="${escapeHTML(l.id)}">Retirer de la tournée</button>`;
// « hors programme » veut dire « à faire, mais personne ne l'a prévu ». Sur un travail terminé
// c'est un contresens : le bureau y lirait un reste à faire là où il n'y a plus rien.
const marque = fini ? `<span class="tournee-marque tournee-marque--fait">déjà récupéré</span>`
: l.horsProgramme ? `<span class="tournee-marque">hors programme</span>` : '';
/* EN ROUTE, VU DU BUREAU. (29/08/2026) Le livreur appuie sur « Je pars » depuis son téléphone ;
   l'heure de départ s'écrit en base, et le bureau doit pouvoir le lire sans appeler personne.
   Le bureau REGARDE, le téléphone AGIT : on reprend ici la marque et l'heure, jamais le geste.
   Un bouton « Je pars » au bureau ferait partir quelqu'un qui n'est pas dans la pièce.
   Et pas d'« en route » sur un travail fini : le départ est effacé au moment où le colis passe
   à « récupéré », donc une carte finie qui afficherait « en route » signalerait un reste à
   faire là où il n'y a plus rien. */
const enRoute = !!l.departAt && !fini;
return `
<div class="tournee-carte ${classe}${enRoute ? ' tournee-carte--route' : ''}">
<div class="tournee-nom">${escapeHTML(l.clienteNom)}${marque}${enRoute ? `<span class="tournee-marque tournee-marque--route">en route</span>` : ''}</div>
${lieuHTML}
${l.note ? `<div class="tournee-note">📝 ${escapeHTML(l.note)}</div>` : ''}
<div class="tournee-compte">
${fini
// Pas de « 0 à prendre » : un zéro se lit comme un manque, et il n'y a pas de manque, il y a
// un travail fait. La carte dit ce qui a été pris, et rien d'autre.
? `<span class="tournee-pris">${l.nbDejaPris} déjà pris</span>`
: l.rienARecuperer
? `<span class="tournee-rien">Rien à récupérer pour l'instant — la ligne reste, un colis peut encore être saisi.</span>`
/* Ce que la cliente a annoncé passe devant le compte réel, et dans les mêmes mots que sur le
   téléphone du livreur : la phrase vient de libelleAnnonceRecuperation(), dans config.js. Deux
   formulations écrites séparément finiraient par diverger, et le livreur dirait à la cliente
   autre chose que ce que le bureau a sous les yeux. (30/08/2026) */
: libelleAnnonceRecuperation(l)
? `<span class="tournee-annonce">${escapeHTML(libelleAnnonceRecuperation(l))}</span>${l.nbDejaPris ? ` · <span class="tournee-pris">${l.nbDejaPris} déjà pris</span>` : ''}${enRoute ? ` · <span class="tournee-depart">parti à ${escapeHTML(formatHeure(l.departAt))}</span>` : ''}`
: `<strong>${compte(l.nbAPrendre)}</strong> à prendre${l.nbDejaPris ? ` · <span class="tournee-pris">${l.nbDejaPris} déjà pris</span>` : ''}${enRoute ? ` · <span class="tournee-depart">parti à ${escapeHTML(formatHeure(l.departAt))}</span>` : ''}`}
<!-- Ce que la cliente a annoncé, répété tel quel quand rien ne le dit déjà. Sans cette ligne,
     le champ de saisie est en écriture seule sur une tournée posée pour demain — et une
     annonce ne se relit jamais. (30/08/2026, ajouté en relecture) -->
${(!libelleAnnonceRecuperation(l) && libelleAnnoncePosee(l)) ? `<div class="tournee-rien tournee-rien--attente">${escapeHTML(libelleAnnoncePosee(l))}</div>` : ''}
<!-- Ce que le livreur a confirmé sur place (06/09/2026) : la même phrase que sur son téléphone,
     libelleColisPris() dans config.js. En rouge dès que ça ne colle pas avec l'annonce. -->
${libelleColisPris(l) ? `<div class="tournee-pris-confirme${(l.nbAnnonce !== null && l.nbAnnonce !== undefined && l.nbPris !== l.nbAnnonce) ? ' tournee-pris-confirme--ecart' : ''}">✔ ${escapeHTML(libelleColisPris(l))}${l.prisConfirmeAt ? ` · confirmé par le livreur à ${escapeHTML(formatHeure(l.prisConfirmeAt))}` : ''}${l.prisNote ? `<div class="tournee-pris-note">${escapeHTML(l.prisNote)}</div>` : ''}</div>` : ''}
</div>
${contacts}
${geste}
</div>`;
};

// Un bloc par livreur, son sous-total dans son titre. Le nom du livreur est écrit une fois en
// haut du bloc et non répété sur chaque carte : répété, il devient du bruit ; en titre, il
// devient un repère.
const blocLivreur = (g) => `
<div class="tournee-section-titre">${escapeHTML(g.livreurNom)} · ${g.total.nbClientes} cliente${g.total.nbClientes > 1 ? 's' : ''} · ${colisConnus ? g.total.nbAPrendre + ' colis à prendre' : 'colis à venir'}</div>
${g.lignes.map(carteHTML).join('')}`;

// Ce qui est fait ne s'annonce pas en « colis à prendre » : ce serait un zéro, et un zéro se lit
// comme un manque. Le titre du bloc annonce donc ce qui a été récupéré.
const blocLivreurFait = (g) => `
<div class="tournee-section-titre">${escapeHTML(g.livreurNom)} · ${g.total.nbClientes} cliente${g.total.nbClientes > 1 ? 's' : ''} · ${g.total.nbDejaPris} colis récupéré${g.total.nbDejaPris > 1 ? 's' : ''}</div>
${g.lignes.map(carteHTML).join('')}`;

const programmees = lignes.filter(l => !l.horsProgramme);
const confiees    = lignes.filter(l => l.horsProgramme && !travailFini(l));
const dejaFaites  = lignes.filter(travailFini);
const colisConfies = confiees.reduce((s, l) => s + l.nbAPrendre, 0);
const colisFaits   = dejaFaites.reduce((s, l) => s + l.nbDejaPris, 0);

const sectionProgramme = programmees.length
? tourneesParLivreur(programmees).map(blocLivreur).join('')
: `<div class="empty-state">Aucune récupération programmée ${escapeHTML(dateLabel)}. Choisissez une cliente et un livreur ci-dessus pour commencer la tournée.</div>`;

/* LE REPLI DES CLIENTES CONFIÉES SANS TOURNÉE. (28/08/2026)
   Le 28/08/2026, le seul compte de GONSON Christ portait dix clientes et trente-six colis
   confiés que personne n'avait programmés, et rien de tout cela n'apparaissait au bureau. Ce
   n'est pas une anomalie à masquer, c'est du travail à répartir : d'où le bouton qui pose la
   tournée. Replié parce que ce n'est pas la décision du jour ; présent parce que c'en est le
   reste. Et compté dans le TOTAL, parce que replier n'est pas retrancher. */
const sectionConfiees = confiees.length
? `<details class="tournee-repli">
<summary>Confiées sans tournée posée · ${confiees.length} cliente${confiees.length > 1 ? 's' : ''}, ${colisConfies} colis</summary>
<div class="tournee-repli-aide">De la marchandise attend chez ces clientes et elle est déjà confiée à un livreur, mais aucune tournée ne la porte ${escapeHTML(dateLabel)}. Le livreur les voit sur son téléphone ; posez-leur une tournée pour qu'elles entrent dans le programme.</div>
${tourneesParLivreur(confiees).map(blocLivreur).join('')}
</details>`
: '';

/* LE TIROIR DU TRAVAIL FAIT. (28/08/2026)
   Mesuré en ligne le jour même : le repli ci-dessus s'intitulait « Confiées sans tournée posée ·
   22 clientes, 34 colis » alors que dix de ces vingt-deux n'avaient plus rien à faire récupérer.
   Le tiroir portait un nom faux pour près de la moitié de son contenu, ces clientes étaient
   marquées « hors programme », et on leur proposait de poser une tournée pour un travail
   terminé. Les chiffres étaient justes ; les mots, non — et un chiffre juste sous un mot faux
   se lit faux. Trois questions, trois tiroirs : ce qui est décidé, ce qui reste à décider, ce
   qui est fait. Le troisième est replié comme les autres et compté comme les autres. */
const motDuJour = jour === aujourdhuiAbidjan() ? ' aujourd\'hui' : '';
const sectionFaites = dejaFaites.length
? `<details class="tournee-repli tournee-repli--fait">
<summary>Déjà récupéré${motDuJour} · ${dejaFaites.length} cliente${dejaFaites.length > 1 ? 's' : ''}, ${colisFaits} colis</summary>
<div class="tournee-repli-aide">Personne n'avait posé de tournée chez ces clientes, et pourtant un livreur y est passé : leurs colis sont ramassés et plus rien ne les attend. Elles figurent ici pour que la journée soit complète, et elles comptent dans le TOTAL du bas.</div>
${tourneesParLivreur(dejaFaites).map(blocLivreurFait).join('')}
</details>`
: '';

cltPoserHTML(body, `
<div class="recap-day-summary">${escapeHTML(dateLabel)} · <strong>${total.nbClientes}</strong> cliente${total.nbClientes > 1 ? 's' : ''} · <strong>${total.nbLivreurs}</strong> livreur${total.nbLivreurs > 1 ? 's' : ''}</div>
${sectionProgramme}
${sectionConfiees}
${sectionFaites}
<div class="recap-day-summary" style="margin-top:14px;">
TOTAL · <strong>${total.nbClientes}</strong> cliente${total.nbClientes > 1 ? 's' : ''} ·
<strong>${total.nbLivreurs}</strong> livreur${total.nbLivreurs > 1 ? 's' : ''} ·
<strong>${colisConnus ? total.nbAPrendre : 'à venir'}</strong> à prendre ·
<strong>${colisConnus ? total.nbDejaPris : 'à venir'}</strong> déjà pris
</div>
${total.nbHorsProgramme > 0 ? `<div class="meta" style="margin-top:6px; color:#b45309;">Le total ci-dessus compte tout, y compris <strong>${total.nbHorsProgramme}</strong> cliente${total.nbHorsProgramme > 1 ? 's' : ''} du repli.</div>` : ''}
${ligneRestes}
<!-- L'ÉCART, DANS LE TOTAL ET PAS SEULEMENT SUR LES CARTES. (30/08/2026)
     Chaque carte porte déjà sa mention ambre, mais il faut faire défiler tout l'écran pour les
     trouver. Le total est le seul endroit qu'on lit à coup sûr. On compte les CLIENTES autant
     que les colis : c'est le nombre de coups de téléphone à passer ce soir. Signalé en
     relecture le jour même — le calcul existait, personne ne l'affichait. -->
${total.nbColisManquants > 0 ? `<div class="meta" style="margin-top:6px; color:#9a6400;"><strong>${total.nbColisManquants}</strong> colis annoncé${total.nbColisManquants > 1 ? 's' : ''} par ${total.nbClientesAvecEcart} cliente${total.nbClientesAvecEcart > 1 ? 's' : ''} ${total.nbClientesAvecEcart > 1 ? 'ne sont' : 'n\'est'} pas encore saisi${total.nbColisManquants > 1 ? 's' : ''} — à vérifier avant la fin de la journée.</div>` : ''}
${(!colisConnus || total.nbClientesSansRien > 0) ? `<div class="recap-bilan-note">
${colisConnus
? `Sur ces ${total.nbClientes} cliente(s), ${total.nbClientesSansRien} n'${total.nbClientesSansRien > 1 ? 'ont' : 'a'} rien à faire récupérer pour l'instant — la ligne reste, parce qu'un colis peut encore être saisi d'ici le passage du livreur.`
: `La journée n'est pas encore arrivée : aucun colis n'existe pour elle. Les comptes se rempliront tout seuls à mesure que les colis seront saisis, et chacun se rattachera au livreur désigné ici.`}
</div>` : ''}`);
}

/* POSER UNE TOURNÉE POUR UNE CLIENTE DU REPLI, SANS LA RETAPER. (28/08/2026)

   Le bouton pré-remplit la cliente et le livreur déjà désigné sur ses colis, puis remonte au
   formulaire. IL N'ÉCRIT RIEN EN BASE. C'est volontaire : entre « je regarde ce qui traîne » et
   « j'engage un livreur à traverser Abidjan » il doit rester un geste de confirmation, et c'est
   le bouton « Ajouter » qui existe déjà. Un écran qui écrit sur un clic mal placé se paie en
   déplacements inutiles.

   ON DIT QUAND ÇA NE MARCHE PAS. Si la cliente ou le livreur n'est pas dans les listes — compte
   désactivé, fiche supprimée — le champ resterait vide sans rien dire, et le bureau croirait
   avoir choisi. Mieux vaut l'annoncer. */
function progPreremplir(cle){
// Trois parties depuis le 31/08/2026 : cliente, livreur, et le nombre déjà annoncé. La
// troisième est absente quand on POSE une tournée pour une cliente du repli — il n'y a alors
// rien à relire — et présente quand on MODIFIE une programmation existante.
const [fournisseurId, livreurId, nbAnnonce, noteExistante] = String(cle || '').split('|');
const manquants = [];
const poser = (id, valeur, quoi) => {
const select = document.getElementById(id);
if (!select) return;
if (!valeur) { manquants.push(quoi); return; }
const existe = Array.prototype.some.call(select.options, o => o.value === valeur);
if (!existe) { manquants.push(quoi); return; }
select.value = valeur;
// Le champ de recherche n'affiche son libellé qu'en écoutant « change » : sans cet
// événement la valeur serait posée mais l'écran continuerait d'afficher « Sélectionner… ».
select.dispatchEvent(new Event('change', { bubbles: true }));
};
poser('prog-fournisseur', fournisseurId, 'la cliente');
poser('prog-livreur', livreurId, 'le livreur');

const note = document.getElementById('prog-note');
if (note) note.value = noteExistante || '';
// Le nombre annoncé se vide comme la note, et pour la même raison : un « 3 » resté en place
// serait annoncé pour la cliente suivante. L'oublier ici pendant qu'on vide la note serait
// l'asymétrie la plus facile à ne jamais remarquer. (30/08/2026)
// On repose ce qui avait été annoncé quand on modifie une programmation, et on vide dans tous
// les autres cas : un « 3 » resté en place serait annoncé pour la cliente suivante.
const nbColis = document.getElementById('prog-nb-colis');
if (nbColis) nbColis.value = (nbAnnonce === undefined ? '' : nbAnnonce);

const ancre = document.getElementById('prog-fournisseur');
if (ancre && ancre.scrollIntoView) ancre.scrollIntoView({ block: 'center' });
if (manquants.length) {
cltToast('Impossible de pré-remplir ' + manquants.join(' et ') + " : la fiche n'est plus dans la liste. Choisissez-la à la main.", { type: 'error' });
}
}

// Ajouter une cliente à la tournée. `upsert` et non `insert` : la table n'accepte qu'une seule
// ligne par (jour, cliente), et corriger le livreur choisi doit rester un geste — on rechoisit
// la cliente, on rechoisit le livreur, on valide. Sans cela l'écran renverrait une erreur de
// doublon là où l'utilisateur croit simplement se corriger.
// Identifiant de la programmation en cours de modification ; null quand on ajoute.
let progEnCoursId = null;
function progEntrerEnModification(id){
progEnCoursId = id || null;
const bandeau = document.getElementById('prog-mode-modif');
const bouton = document.getElementById('btn-prog-ajouter');
if (bandeau) bandeau.classList.toggle('hidden', !progEnCoursId);
if (bouton) bouton.textContent = progEnCoursId ? '💾 Enregistrer la modification' : '➕ Ajouter à la tournée';
}
async function progAjouter(){
const champs = {
jour: progGetJour(),
fournisseurId: document.getElementById('prog-fournisseur').value || '',
livreurId: document.getElementById('prog-livreur').value || '',
note: document.getElementById('prog-note').value || '',
nbColisAnnonce: document.getElementById('prog-nb-colis').value || '',
};
const refus = raisonDeRefuserLaProgrammation(champs);
if (refus) { progMsg(refus, 'error'); return; }

const bouton = document.getElementById('btn-prog-ajouter');
if (bouton) { bouton.disabled = true; bouton.textContent = 'Enregistrement…'; }

const ligne = programmationARecuperationAEcrire(champs);
let error = null;
// (typeof … : le banc d'essai exécute cette fonction seule, sans le reste de l'écran.)
const enModification = (typeof progEnCoursId !== 'undefined') ? progEnCoursId : null;
if (enModification) {
// Modification : on réécrit LA ligne choisie — journée, cliente, livreur, note, annonce — au lieu
// d'en poser une nouvelle. La contrainte « une par jour et par cliente » reste : déplacer une
// tournée sur un jour où la cliente est déjà programmée est refusé, et on le dit clairement.
ligne.modifie_par = currentUser ? currentUser.id : null;
ligne.updated_at = new Date().toISOString();
({ error } = await supabaseClient.from('programmations_collecte').update(ligne).eq('id', enModification));
if (error && /programmations_collecte_une_par_jour|duplicate|unique/i.test(error.message || '')) {
error = { message: "cette cliente est déjà programmée ce jour-là. Retirez d'abord l'autre ligne, ou modifiez-la." };
}
} else {
ligne.cree_par = currentUser ? currentUser.id : null;
({ error } = await supabaseClient
.from('programmations_collecte')
.upsert(ligne, { onConflict: 'jour,fournisseur_id' }));
}

if (bouton) { bouton.disabled = false; bouton.textContent = enModification ? '💾 Enregistrer la modification' : '➕ Ajouter à la tournée'; }

if (error) {
console.error(error);
progMsg("Enregistrement refusé : " + (error.message || 'erreur inconnue'), 'error');
return;
}
// Si la journée a changé, on suit la programmation sur sa nouvelle journée : l'écran ne doit
// pas rester sur un jour où elle n'est plus.
const champJour = document.getElementById('prog-jour');
if (enModification && champJour && champJour.value && typeof progJourChoisi !== 'undefined') { progJourChoisi = champJour.value; }
if (typeof progEntrerEnModification === 'function') progEntrerEnModification(null);
document.getElementById('prog-note').value = '';
// Le nombre annoncé se vide comme la note : il appartient à la cliente qu'on vient de poser,
// pas à la suivante. Le laisser en place ferait annoncer trois colis à tout le monde. (30/08/2026)
document.getElementById('prog-nb-colis').value = '';
progMsg('Tournée mise à jour.', 'success');
chargerProgrammations();
}

async function progRetirer(id){
if (!id) return;
const okRetrait = (typeof cltConfirm === 'function')
? await cltConfirm({ title: 'Retirer cette cliente de la tournée ?', sub: 'Ses colis déjà saisis ne bougent pas ; seule la programmation est retirée.', okLabel: 'Oui, retirer', cancelLabel: 'Garder', danger: true })
: confirm("Retirer cette cliente de la tournée ?");
if (!okRetrait) return;
const { error } = await supabaseClient.from('programmations_collecte').delete().eq('id', id);
if (error) { console.error(error); progMsg("Suppression refusée : " + (error.message || 'erreur inconnue'), 'error'); return; }
progMsg('Cliente retirée de la tournée.', 'success');
chargerProgrammations();
}

let recapExpanded = false;

function toggleRecap(){
recapExpanded = !recapExpanded;
const recapBox = document.getElementById('recap-fournisseur');
if (recapExpanded) { expandCollapsible(recapBox); } else { collapseCollapsible(recapBox); }
document.getElementById('recap-arrow').textContent = recapExpanded ? '▼' : '▶';
if (recapExpanded) refreshStickyTables(recapBox);
}

// ---- Récapitulatif par client (par jour, cliquable) ----
// Le récapitulatif porte sur les clientes (vendeuses) dont au moins un colis a été
// enregistré le jour sélectionné (aujourd'hui par défaut). On clique sur une cliente
// pour afficher le bilan détaillé de SES colis du jour : téléphone du destinataire,
// adresse de livraison, statut, montant article et observation. Conçu pour rester
// lisible sur mobile (le tableau se transforme en cartes sous 640px).
let recapSelectedDate = null;         // 'YYYY-MM-DD' ; null => aujourd'hui
let recapSelectedFournisseur = null;  // cliente sélectionnée (ou null = vue liste)
let recapSearchText = '';
let recapDayCache = {};               // date -> colis[] (jours passés rapatriés de la base)
// Deux récapitulatifs (par client, par livreur) lisent maintenant ce cache, chacun avec SA
// date. Un seul drapeau « je charge » les ferait clignoter ensemble : celui qui affiche
// aujourd'hui se mettrait à dire « chargement » parce que l'autre remonte le 12 août. On
// retient donc quels jours sont en cours de route, et chacun ne regarde que le sien.
let recapJoursEnCours = {};

function recapGetDate(){
return recapSelectedDate || todayLocalISODate();
}

// Colis du jour sélectionné : aujourd'hui => on filtre les colis déjà en mémoire
// (500 plus récents = tous ceux du jour, en direct) ; un jour passé => cache rapatrié.
function recapDayColis(){
const date = recapGetDate();
if (date === todayLocalISODate()) {
// dayKey() et non un découpage de la chaîne ISO : le découpage lit l'heure de Greenwich,
// dayKey lit l'heure du téléphone. Ici les deux coïncident, mais la fiche « Son écran » et
// le récapitulatif par livreur emploient dayKey — trois définitions de « aujourd'hui » pour
// trois écrans, c'est la fabrique à écarts. Une seule, celle de config.js.
return allColis.filter(c => jourDuColis(c) === date);
}
return recapDayCache[date] || [];
}

// Rapatrie tous les colis d'un jour passé depuis la base (mis en cache), car `allColis`
// ne couvre que les pages récentes tant que "Charger plus" n'a pas tout ramené.
async function recapLoadPastDay(date, options){
const forcer = !!(options && options.forcer);
if (recapDayCache[date] && !forcer) { recapRedessinerLesDeux(); return; }
if (recapJoursEnCours[date]) return;
recapJoursEnCours[date] = true;
// Pas d'écran « Chargement… » quand on rafraîchit un jour déjà affiché : le tableau reste, et
// se remplace d'un coup quand la base a répondu.
if (!recapDayCache[date]) recapRedessinerLesDeux();
// Le jour d'un colis, c'est jourDuColis() : le jour de réception, ou le jour où il a été
// reporté. On ramène donc les colis reçus ce jour-là ET ceux qui y ont été reportés, puis on
// garde ceux dont c'est vraiment le jour — un colis reçu la veille et reporté à ce jour compte
// ici, un colis reçu ce jour-là mais reporté au lendemain n'y compte plus. (10/09/2026)
const { data, error } = await supabaseClient
.from('colis')
.select('*')
.or(`reporte_au.eq.${date},and(created_at.gte.${date}T00:00:00,created_at.lte.${date}T23:59:59)`)
.order('created_at', { ascending: false });
delete recapJoursEnCours[date];
if (error) { console.error(error); if (!recapDayCache[date]) recapDayCache[date] = []; }
else recapDayCache[date] = (data || []).filter(c => jourDuColis(c) === date);
recapRedessinerLesDeux();
}

// Un colis vient de changer (temps réel, retour au premier plan, filet périodique) : les jours
// passés gardés en mémoire ne sont plus sûrs. On oublie ceux que personne ne regarde, et on
// recharge ceux qui sont à l'écran — dans le récapitulatif par client ou par livreur.
function recapRechargerJoursPasses(){
const aujourdhui = todayLocalISODate();
const regardes = new Set([recapGetDate(), recaplGetDate()].filter(d => d && d !== aujourdhui));
Object.keys(recapDayCache).forEach(d => { if (!regardes.has(d)) delete recapDayCache[d]; });
regardes.forEach(d => recapLoadPastDay(d, { forcer: true }));
}

// Un jour rapatrié sert aux deux récapitulatifs : on le paie une fois, on le rend aux deux.
function recapRedessinerLesDeux(){
renderRecapBody();
renderRecapLivreurBody();
}

// Point d'entrée appelé par renderColis() : garde la barre (date) stable et ne
// re-rend que le corps dynamique (liste des clientes ou bilan).
function renderRecapFournisseur(){
const dateInput = document.getElementById('recap-date');
if (dateInput && !dateInput.value) dateInput.value = recapGetDate();
renderRecapBody();
}

function renderRecapBody(){
const body = document.getElementById('recap-body');
if (!body) return;

// « Chargement du jour… » SEULEMENT si on n'a encore rien à montrer pour ce jour. (11/09/2026,
// Celtis : « l'écran danse ».) Mesuré en direct : un jour passé était rechargé toutes les 25 s et
// à chaque événement temps réel, et pendant les ~200 ms de la lecture ce corps se vidait — la
// page perdait 1 900 px de hauteur, puis les retrouvait. Le défilement sautait à chaque fois.
// Désormais le tableau déjà affiché reste en place et se remplace d'un coup, données reçues.
if (recapJoursEnCours[recapGetDate()] && !recapDayCache[recapGetDate()]) {
cltPoserHTML(body, `<div class="empty-state">Chargement du jour…</div>`);
return;
}

const colisJour = recapDayColis();

// Vue "bilan" d'une cliente choisie.
if (recapSelectedFournisseur) {
if (!cltPoserHTML(body, renderRecapBilan(recapSelectedFournisseur, colisJour))) return;
const back = document.getElementById('recap-back');
if (back) back.addEventListener('click', () => { recapSelectedFournisseur = null; renderRecapBody(); });
// « Son écran » ouvre la fiche sur la journée déjà choisie ici : c'est le même jour que
// le tableau qu'on est en train de lire, sinon les deux ne parleraient pas des mêmes colis.
const ecran = document.getElementById('recap-ecran');
if (ecran) ecran.addEventListener('click', () => ouvrirFicheEcran('cliente', recapSelectedFournisseur, recapGetDate()));
brancherReleveBarre();
return;
}

// Vue "liste" : une carte cliquable par cliente ayant des colis ce jour-là.
const parClient = {};
colisJour.forEach(c => {
const key = c.fournisseur_id || 'inconnu';
if (!parClient[key]) parClient[key] = { id: key, colis: [] };
parClient[key].colis.push(c);
});
let clients = Object.values(parClient)
.map(c => ({ id: c.id, nb: c.colis.length, t: totauxArgent(c.colis) }))
.sort((a, b) => b.nb - a.nb);

const q = recapSearchText.trim().toLowerCase();
if (q) clients = clients.filter(c => fournisseurLabelPlain(c.id).toLowerCase().includes(q));

const dateLabel = recapDayLabel(recapGetDate());
const totalColis = colisJour.length;
const totalClients = Object.keys(parClient).length;

if (!totalColis) {
cltPoserHTML(body, `<div class="empty-state">Aucune cliente enregistrée pour ${dateLabel}.</div>`);
return;
}

// Sur la vignette de chaque cliente : ce qui est parti, et en dessous ce qui est rentré.
// Le second chiffre est celui dont on se sert pour la payer, il est donc distingué.
const cards = clients.map(c => `
<button type="button" class="recap-client-card" data-fid="${escapeHTML(c.id)}">
<span class="recap-client-name">${fournisseurLabel(c.id)}</span>
<span class="recap-client-meta">
<span class="recap-client-count">${c.nb} colis · ${c.t.nbLivres} livré${c.t.nbLivres > 1 ? 's' : ''}</span>
<span class="recap-client-amount">${formatMontant(c.t.articleEnregistre) || '0 FCFA'}</span>
<span class="recap-client-encaisse">encaissé : ${formatMontant(c.t.articleEncaisse) || '0 FCFA'}</span>
</span>
</button>`).join('');

const tJour = totauxArgent(colisJour);

// Ce bloc contient un champ de recherche. Le réécrire à l'identique toutes les 25 secondes
// suffisait à faire perdre le curseur et les lettres en train d'être tapées dedans.
if (!cltPoserHTML(body, `
<div class="recap-day-summary">${dateLabel} · <strong>${totalClients}</strong> cliente${totalClients > 1 ? 's' : ''} · <strong>${totalColis}</strong> colis · <strong>${tJour.nbLivres}</strong> livré${tJour.nbLivres > 1 ? 's' : ''}</div>
<div class="recap-day-money">
Articles enregistrés : <strong>${formatMontant(tJour.articleEnregistre) || '0 FCFA'}</strong> ·
Articles encaissés : <strong>${formatMontant(tJour.articleEncaisse) || '0 FCFA'}</strong> ·
Frais de livraison CLT : <strong>${formatMontant(tJour.recetteLivraison) || '0 FCFA'}</strong>
</div>
${recapExportBarHTML()}
${recapSearchBarHTML()}
${clients.length ? `<div class="recap-client-list">${cards}</div>` : `<div class="empty-state">Aucune cliente ne correspond à « ${escapeHTML(recapSearchText)} ».</div>`}`)) return;

wireRecapExport();
wireRecapSearch();
body.querySelectorAll('.recap-client-card').forEach(btn => {
btn.addEventListener('click', () => {
recapSelectedFournisseur = btn.dataset.fid;
renderRecapBody();
});
});
}

function recapSearchBarHTML(){
return `
<div class="recap-search-wrap">
<input type="search" id="recap-search" class="recap-search" placeholder="Rechercher une cliente…" value="${escapeHTML(recapSearchText)}">
</div>`;
}

// Ré-rend la liste à chaque frappe tout en conservant le focus et la position du curseur.
function wireRecapSearch(){
const input = document.getElementById('recap-search');
if (!input) return;
input.addEventListener('input', () => {
recapSearchText = input.value;
const pos = input.selectionStart;
renderRecapBody();
const again = document.getElementById('recap-search');
if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) {} }
});
}

// Bilan détaillé d'une cliente : ses colis du jour, colonnes téléphone / adresse / statut /
// article / encaissé / observation. Le tableau devient des cartes sous 640px.
//
// Deux colonnes d'argent et non plus une seule, avec une ligne de TOTAL en pied. C'est ce
// tableau qu'on lit à la cliente au téléphone en fin de journée : il doit donner tout seul la
// somme exacte qui lui revient, sans qu'on ait à additionner de tête ligne par ligne. Le
// « Total article » annoncé au-dessus comptait tous les colis, livrés ou non — donc de l'argent
// qui n'était pas rentré et qui ne rentrerait peut-être jamais.
function renderRecapBilan(fid, colisJour){
const list = colisJour.filter(c => (c.fournisseur_id || 'inconnu') === fid);
// Une seule addition pour l'écran et pour les trois fichiers : voir releveCliente() dans config.js.
const r = releveCliente(list);
const rows = r.lignes.map(l => `
<tr>
<td data-label="Téléphone">${l.telephone ? escapeHTML(l.telephone) : '—'}</td>
<td data-label="Adresse">${l.adresse ? escapeHTML(l.adresse) : '—'}</td>
<td data-label="Statut">${statutBadgeHTML(l.statutCode, l.expedition ? { commune_destination: COMMUNE_EXPEDITION } : null)}</td>
<td data-label="Article">${formatMontant(l.article) || '0 FCFA'}</td>
<td data-label="Vous revient" style="${l.encaisse ? 'font-weight:700;' : 'color:#8a94a3;'}${l.encaisse < 0 ? ' color:#c0392b;' : ''}">${l.encaisse ? formatMontant(l.encaisse) : '—'}</td>
<td data-label="Observation">${l.observation ? escapeHTML(l.observation) : '—'}</td>
</tr>`).join('');

return `
<div class="recap-bilan-head">
<button type="button" class="btn btn-outline btn-sm" id="recap-back">← Clientes</button>
<div class="recap-bilan-title">${fournisseurLabel(fid)}</div>
<button type="button" class="btn btn-outline btn-sm" id="recap-ecran" title="Voir sa journée telle qu'elle la voit dans son espace">👁 Son écran</button>
</div>
<div class="recap-bilan-sub">${recapDayLabel(recapGetDate())} · <strong>${r.nb}</strong> colis · <strong>${r.nbLivres}</strong> livré${r.nbLivres > 1 ? 's' : ''} · Somme qui lui revient : <strong style="color:${r.totalEncaisse < 0 ? '#c0392b' : 'inherit'};">${formatMontant(r.totalEncaisse) || '0 FCFA'}</strong></div>
<div class="recap-table-wrap">
<table class="recap-table recap-table-cards">
<thead><tr>${r.colonnes.map(c => `<th>${escapeHTML(c)}</th>`).join('')}</tr></thead>
<tbody>${rows}</tbody>
${piedTotalHTML(relevePiedCellules(r))}
</table>
</div>
<!-- La phrase n'est plus recopiée ici. Elle l'a été jusqu'au 1er septembre 2026, et cette copie
     avait déjà cessé de dire la même chose que l'originale : RELEVE_NOTE, dans config.js, part
     avec le PDF, l'Excel et le Word chez la vendeuse, celle-ci restait à l'écran de l'équipe.
     Deux textes pour une seule règle, c'est un des deux qu'on oublie de corriger — et comme il
     s'agit d'argent, l'écart se découvre au téléphone, face à quelqu'un qui a le papier. -->
${releveDetailRetenues(r) ? `<div class="recap-bilan-note" style="font-weight:600; color:${COULEUR_NEGATIF_CLT};">${escapeHTML(releveDetailRetenues(r))}</div>` : ''}
<details class="eq-aide"><summary>ℹ️ Comment lire</summary><div class="recap-bilan-note">${escapeHTML(RELEVE_NOTE)}</div></details>
${releveBarreHTML()}`;
}

function fournisseurLabelPlain(id){
const f = fournisseurs.find(x => x.id === id);
if (!f) return 'Client inconnu';
return (f.company_name || f.full_name || id || '').toString();
}

function recapDayLabel(dayKey){
if (!dayKey) return '';
const d = new Date(dayKey + 'T00:00:00');
const label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
return dayKey === todayLocalISODate() ? `Aujourd'hui — ${label}` : label;
}

