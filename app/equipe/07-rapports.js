/* ESPACE ÉQUIPE — 07-rapports — Récapitulatif par livreur, colis qui dorment, relevé du soir d'une cliente (PDF, Excel, Word), rapport vue par jour, réconciliation de caisse.
   Sorti de equipe.html le 16 septembre 2026 (feuille de route 4.8, séances 3 et 4), sans retouche :
   les onze fichiers app/equipe/*.js sont chargés dans l'ordre de leur numéro, à la place de
   l'ancien script inline, et partagent les mêmes globales (scripts classiques). */
/* ============================================================================================
   RÉCAPITULATIF PAR LIVREUR — le pendant du récapitulatif par client
   ============================================================================================
   Demandé le 26 août 2026, dans ces termes : « pour le livreur, on veut pouvoir voir tous les
   colis qui ont été assignés, de suite, à savoir s'il a réussi tous les colis de la journée […]
   et on veut pouvoir vérifier pour chaque livreur ».

   Deux questions, donc, et l'écran doit y répondre SANS QU'ON OUVRE PERSONNE :
     1. a-t-il livré tout ce qu'on lui a confié aujourd'hui ?   → « 8 / 10 livrés »
     2. combien d'argent tient-il encore ?                       → « 45 000 FCFA à remettre »
   C'est pour cela que les deux chiffres sont sur la vignette elle-même, et pas derrière un clic.

   L'ARGENT NE SE RECALCULE PAS ICI. Il sort de caisseParLivreur(), dans config.js — la même
   fonction, au caractère près, que celle qui remplit la « Caisse par livreur » de la
   comptabilité. Deux additions écrites séparément finissent toujours par diverger, et le soir
   du 25 août l'application réclamait déjà 11 000 sur le téléphone du livreur et 14 000 dans le
   tableau de l'équipe. Une seule addition rend l'écart arithmétiquement impossible.

   « Assigné » veut dire : le colis porte son nom (livreur_id), et il a été reçu ce jour-là.
   Un colis sans livreur n'apparaît chez personne — il n'a été confié à personne.
   ============================================================================================ */

let recaplExpanded = false;

function toggleRecapLivreur(){
recaplExpanded = !recaplExpanded;
const box = document.getElementById('recap-livreur');
if (recaplExpanded) { expandCollapsible(box); } else { collapseCollapsible(box); }
const fleche = document.getElementById('recapl-arrow');
if (fleche) fleche.textContent = recaplExpanded ? '▼' : '▶';
if (recaplExpanded) refreshStickyTables(box);
}

let recaplSelectedDate = null;      // 'YYYY-MM-DD' ; null => aujourd'hui
let recaplSelectedLivreur = null;   // livreur ouvert (ou null = vue liste)
let recaplSearchText = '';

function recaplGetDate(){
return recaplSelectedDate || todayLocalISODate();
}

// Le jour choisi ici est indépendant de celui du récapitulatif par client : on regarde souvent
// la tournée d'hier tout en gardant la journée d'aujourd'hui sous les yeux au-dessus. Le cache
// des jours passés, lui, est commun — un jour rapatrié une fois sert aux deux.
/* LE RÉCAPITULATIF PAR LIVREUR EST UN POINT LUI AUSSI : même ancre que celui par client, LE JOUR
   DE RÉCEPTION. Ce qu'on a confié au livreur ce jour-là reste dans le point de ce jour-là, même
   reporté — sinon le soir on lui réclame des comptes sur une liste dont un colis a disparu.
   (22/09/2026 ; voir jourDeReceptionColis et son commentaire dans config.js.) */
function recaplDayColis(){
const date = recaplGetDate();
if (date === todayLocalISODate()) return (allColis || []).filter(c => jourDeReceptionColis(c) === date);
return recapDayCache[date] || [];
}

// Point d'entrée appelé par eqDessinerAnnexes() : la barre du jour reste stable, seul le corps
// est redessiné.
function renderRecapLivreur(){
const champ = document.getElementById('recapl-date');
if (champ && !champ.value) champ.value = recaplGetDate();
renderRecapLivreurBody();
}

function renderRecapLivreurBody(){
const body = document.getElementById('recapl-body');
if (!body) return;

// Même règle que renderRecapBody() : pas d'écran « Chargement » tant qu'on a un jour à montrer.
if (recapJoursEnCours[recaplGetDate()] && !recapDayCache[recaplGetDate()]) {
cltPoserHTML(body, `<div class="empty-state">Chargement du jour…</div>`);
return;
}

const colisJour = recaplDayColis();

// Vue « bilan » d'un livreur choisi.
if (recaplSelectedLivreur) {
if (!cltPoserHTML(body, renderRecapLivreurBilan(recaplSelectedLivreur, colisJour))) return;
const back = document.getElementById('recapl-back');
if (back) back.addEventListener('click', () => { recaplSelectedLivreur = null; renderRecapLivreurBody(); });
// « Son écran » s'ouvre sur la journée déjà choisie ici, sinon les deux tableaux ne
// parleraient pas des mêmes colis.
const ecran = document.getElementById('recapl-ecran');
if (ecran) ecran.addEventListener('click', () => ouvrirFicheEcran('livreur', recaplSelectedLivreur, recaplGetDate()));
// 05/09/2026 — Même fenêtre de remise que la caisse par livreur, mêmes colis (ceux du jour).
const remise = document.getElementById('recapl-remise');
if (remise) remise.addEventListener('click', () => {
const ligne = caisseParLivreur(colisJour.filter(c => c && c.livreur_id === recaplSelectedLivreur))[0];
if (!ligne || !(ligne.idsAremettre.length || ligne.idsFraisARembourser.length)) return;
showRemiseModal(recaplSelectedLivreur, ligne.reste, ligne.idsAremettre, ligne.idsAremettre.length, ligne.idsFraisARembourser);
});
return;
}

const assignes = colisJour.filter(c => c && c.livreur_id);
const dateLabel = recapDayLabel(recaplGetDate());

if (!assignes.length) {
cltPoserHTML(body, `<div class="empty-state">Aucun colis attribué à un livreur pour ${dateLabel}.</div>`);
return;
}

// L'argent, une seule fois, par la fonction partagée — puis rangé par livreur pour la lecture.
const caisse = {};
caisseParLivreur(assignes).forEach(l => { caisse[l.id] = l; });

const parLivreur = {};
assignes.forEach(c => {
const key = c.livreur_id;
if (!parLivreur[key]) parLivreur[key] = [];
parLivreur[key].push(c);
});

let lignes = Object.keys(parLivreur).map(id => {
const list = parLivreur[id];
const t = totauxArgent(list);
const money = caisse[id] || { reste: 0, remis: 0, total: 0 };
return { id, nb: list.length, nbLivres: t.nbLivres, reste: money.reste, remis: money.remis, total: money.total };
});

// D'abord ceux qu'il reste à solder, du plus gros au plus petit : c'est l'ordre dans lequel on
// passe les appels le soir. À égalité, celui qui a le plus de colis en attente.
lignes.sort((a, b) => (b.reste - a.reste) || ((b.nb - b.nbLivres) - (a.nb - a.nbLivres)));

const q = recaplSearchText.trim().toLowerCase();
if (q) lignes = lignes.filter(l => livreurNomSimple(l.id).toLowerCase().includes(q));

const totalAssignes = assignes.length;
const totalLivres = totauxArgent(assignes).nbLivres;
const totalReste = Object.keys(caisse).reduce((s, k) => s + (Number(caisse[k].reste) || 0), 0);
const nbLivreurs = Object.keys(parLivreur).length;

const cards = lignes.map(l => `
<button type="button" class="recap-client-card" data-lid="${escapeHTML(l.id)}">
<span class="recap-client-name">🛵 ${collecteLivreurLabel(l.id) || 'Livreur inconnu'}</span>
<span class="recap-client-meta">
<span class="recap-client-count">${l.nbLivres} / ${l.nb} livré${l.nb > 1 ? 's' : ''}</span>
${recaplResteHTML(l.reste)}
</span>
</button>`).join('');

if (!cltPoserHTML(body, `
<div class="recap-day-summary">${dateLabel} · <strong>${nbLivreurs}</strong> livreur${nbLivreurs > 1 ? 's' : ''} · <strong>${totalLivres}</strong> / <strong>${totalAssignes}</strong> colis livré${totalAssignes > 1 ? 's' : ''}</div>
<div class="recap-search-wrap">
<input type="search" id="recapl-search" class="recap-search" placeholder="Rechercher un livreur…" value="${escapeHTML(recaplSearchText)}">
</div>
${lignes.length ? `<div class="recap-client-list">${cards}</div>` : `<div class="empty-state">Aucun livreur ne correspond à « ${escapeHTML(recaplSearchText)} ».</div>`}
<div class="recapl-total">
<span>TOTAL — ${nbLivreurs} livreur${nbLivreurs > 1 ? 's' : ''}</span>
<span><strong>${totalLivres} / ${totalAssignes}</strong> livré${totalAssignes > 1 ? 's' : ''}</span>
<span class="${totalReste > 0 ? 'recapl-reste-du' : 'recapl-reste-solde'}">${totalReste > 0 ? formatMontant(totalReste) + ' à remettre' : (totalReste < 0 ? 'CLT doit ' + formatMontant(-totalReste) : '✓ tout est remis')}</span>
</div>
<details class="eq-aide"><summary>ℹ️ Comment lire</summary><div class="recap-bilan-note">
La ligne TOTAL porte sur <strong>tous</strong> les livreurs de la journée, y compris ceux que la recherche masque en ce moment.
Le montant « à remettre » sort du même calcul que la <strong>Caisse par livreur</strong> de la comptabilité : les deux écrans ne peuvent pas donner deux sommes différentes.
</div></details>`)) return;

const input = document.getElementById('recapl-search');
if (input) input.addEventListener('input', () => {
recaplSearchText = input.value;
const pos = input.selectionStart;
renderRecapLivreurBody();
const again = document.getElementById('recapl-search');
if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) {} }
});

body.querySelectorAll('.recap-client-card').forEach(btn => {
btn.addEventListener('click', () => {
recaplSelectedLivreur = btn.dataset.lid;
renderRecapLivreurBody();
});
});
}

// Le reste à remettre, dit en clair sur la vignette. Un reste NÉGATIF n'est pas une anomalie :
// il veut dire que l'avance payée à la gare dépasse ce que le livreur a encaissé — c'est alors
// CLT qui lui doit. L'écrire « 0 » pour faire propre effacerait une dette réelle.
function recaplResteHTML(reste){
const r = Number(reste) || 0;
if (r > 0) return `<span class="recap-client-amount recapl-reste-du">${formatMontant(r)} à remettre</span>`;
if (r < 0) return `<span class="recap-client-amount recapl-reste-avance">CLT lui doit ${formatMontant(-r)}</span>`;
return `<span class="recap-client-encaisse">✓ soldé</span>`;
}

/* Bilan d'un livreur : la liste de tout ce qu'on lui a confié ce jour-là, une ligne par colis,
   avec le statut bien visible — c'est là qu'on voit d'un trait ce qui n'est pas passé.

   La colonne « En main » est ce que CE colis met dans sa poche. Elle sort de
   montantEnMainDuLivreur() pour les colis livrés, et vaut moins l'avance de gare pour les colis
   pas encore livrés : le jour de la livraison l'argent sera réclamé en entier, aujourd'hui on ne
   lui rend que les billets qu'il a laissés à la gare. Son total est, par construction, le
   `total` de caisseParLivreur() — donc le même chiffre que la comptabilité. */
function renderRecapLivreurBilan(lid, colisJour){
const list = colisJour.filter(c => c && c.livreur_id === lid);
const t = totauxArgent(list);
const money = caisseParLivreur(list)[0] || { reste: 0, remis: 0, total: 0 };
const enMain = (c) => (c.statut === 'livre')
? (Number(montantEnMainDuLivreur(c)) || 0)
: -(Number(fraisExpeditionARembourser(c)) || 0);
// 05/09/2026 — Depuis le bilan, on doit pouvoir appeler le livreur et enregistrer sa remise sans
// repasser par Finances › Caisse par livreur (Celtis).
const tel = ((typeof livreurs !== 'undefined' ? livreurs : []).find(l => l.id === lid) || {}).phone || '';

const rows = list.map(c => {
const m = enMain(c);
return `
<tr>
<td data-label="Cliente">${fournisseurLabel(c.fournisseur_id)}</td>
<td data-label="Destinataire">${c.destinataire_telephone ? escapeHTML(c.destinataire_telephone) : '—'}</td>
<td data-label="Adresse">${colisDestinationTexte(c) ? escapeHTML(colisDestinationTexte(c)) : '—'}</td>
<td data-label="Statut">${statutBadgeHTML(c.statut, c)}</td>
<td data-label="Article">${formatMontant(montantArticleEncaisse(c)) || '—'}</td>
<td data-label="Livraison">${formatMontant(montantLivraisonEncaissee(c)) || '—'}</td>
<td data-label="En main" style="${m ? 'font-weight:700;' : 'color:#8a94a3;'}${m < 0 ? ` color:${COULEUR_NEGATIF_CLT};` : ''}">${m ? formatMontant(m) : '—'}${c.encaissement_remis ? ' <span class="recapl-remis">remis</span>' : ''}</td>
<td data-label="Observation" class="recapl-obs">${observationTexte(c) ? escapeHTML(observationTexte(c)) : '<span style="color:#8a94a3;">—</span>'}</td>
</tr>`;
}).join('');

const nonLivres = list.length - t.nbLivres;

return `
<div class="recap-bilan-head">
<button type="button" class="btn btn-outline btn-sm" id="recapl-back">← Livreurs</button>
<div class="recap-bilan-title">🛵 ${collecteLivreurLabel(lid) || 'Livreur inconnu'}</div>
<button type="button" class="btn btn-outline btn-sm" id="recapl-ecran" title="Voir sa journée telle qu'il la voit sur son téléphone">👁 Son écran</button>
${tel ? `<a class="btn btn-outline btn-sm" href="tel:${escapeHTML(tel)}">📞 Appeler</a>` : ''}
${money.reste > 0 ? `<button type="button" class="btn btn-primary btn-sm" id="recapl-remise">💵 Enregistrer la remise</button>` : ''}
</div>
<div class="recap-bilan-sub">${recapDayLabel(recaplGetDate())} · <strong>${list.length}</strong> colis confié${list.length > 1 ? 's' : ''} · <strong>${t.nbLivres}</strong> livré${t.nbLivres > 1 ? 's' : ''}${nonLivres ? ` · <strong>${nonLivres}</strong> encore en cours` : ' · tout est livré'}</div>
<div class="recap-day-money">
En main sur la journée : <strong>${formatMontant(money.total) || '0 FCFA'}</strong> ·
Déjà remis : <strong>${formatMontant(money.remis) || '0 FCFA'}</strong> ·
Reste à remettre : <strong>${money.reste ? formatMontant(money.reste) : '0 FCFA'}</strong>
</div>
<div class="recap-table-wrap">
<table class="recap-table recap-table-cards">
<thead><tr><th>Cliente</th><th>Destinataire</th><th>Adresse</th><th>Statut</th><th>Article</th><th>Livraison</th><th>En main</th><th>Observation</th></tr></thead>
<tbody>${rows}</tbody>
${piedTotalHTML([
{ texte: 'TOTAL' },
{ texte: '' },
{ texte: '' },
{ texte: t.nbLivres + ' / ' + list.length + ' livré(s)', label: 'Statut' },
{ texte: formatMontant(t.articleEncaisse) || '0 FCFA', label: 'Article' },
{ texte: formatMontant(t.livraisonEncaissee) || '0 FCFA', label: 'Livraison' },
{ texte: formatMontant(money.total) || '0 FCFA', couleur: '#1a7d3c', label: 'En main' },
{ texte: '' },
])}
</table>
</div>
<details class="eq-aide"><summary>ℹ️ Comment lire</summary><div class="recap-bilan-note">
« En main » est ce que le livreur détient réellement pour ce colis : l'article et la livraison encaissés, moins l'avance de gare qu'il a payée de sa poche et qu'on ne lui a pas encore remboursée.
Sur un colis <strong>pas encore livré</strong>, seule cette avance apparaît, en négatif — rien n'a été encaissé, et on ne solde pas un colis qui n'est pas arrivé.
Le total de cette colonne est celui de la <strong>Caisse par livreur</strong> en comptabilité, au franc près.
</div></details>`;
}


/* ============================================================================================
   LES COLIS QUI DORMENT  (29/08/2026)
   ============================================================================================
   Cet écran n'additionne rien. Il appelle colisQuiDorment() dans config.js et se contente de
   mettre en forme ce qu'elle rend. Le jour où le seuil change, ou la façon de compter les jours,
   ou la manière de traiter un colis sans date de récupération, rien ne bouge ici.

   Deux mots méritent qu'on y fasse attention en relisant ce code :

   « AU MOINS ». La phrase d'âge n'est PAS fabriquée ici. Elle vient de ageColisEnMainTexte(),
   dans config.js, qui décide seule quand écrire « au moins ». Si cet écran écrivait lui-même
   « ${jours} jours », il affirmerait une date de récupération que la base ne connaît pas pour
   40 colis sur 71, et il aurait l'air d'autant plus sûr de lui qu'il serait précis.

   « VALEUR ». C'est la marchandise que le destinataire devra remettre — montantTotalColis() —
   et non l'argent que le livreur a en poche. Sur un colis pas encore livré, rien n'est encaissé :
   la colonne « En main » du récapitulatif au-dessus répondrait zéro sur les 71. Deux questions
   différentes, deux fonctions différentes, et surtout deux mots différents à l'écran.
   ============================================================================================ */

/* La section « Colis qui dorment » est un <details> depuis le 06/09/2026 : c'est le navigateur
   qui l'ouvre et la ferme. Le basculement écrit à la main (toggleColisQuiDorment et son
   drapeau) n'était plus appelé par personne, et manipulait un « dorment-arrow » retiré de la
   page le même jour. Supprimé le 17/09/2026 (point 9.7). */
// Le compteur du titre, visible section fermée. C'est lui qui fait ouvrir la section.
function renderDormentBadge(releve){
const badge = document.getElementById('dorment-badge');
if (!badge) return;
if (!releve.total.nbColis) { badge.innerHTML = ''; return; }
badge.innerHTML = `<span class="dorment-badge">${releve.total.nbColis} · ${escapeHTML(formatMontant(releve.total.valeur))}</span>`;
}

function renderColisQuiDorment(){
const releve = colisQuiDorment(allColis || []);
renderDormentBadge(releve);
const body = document.getElementById('dorment-body');
if (!body) return;

if (!releve.total.nbColis) {
cltPoserHTML(body, `<div class="empty-state">Aucun colis en main depuis plus de ${releve.total.seuilJours} jours. Rien ne dort.</div>`);
return;
}

const lignes = [];
releve.livreurs.forEach(l => {
lignes.push(`<tr class="dorment-ligne-livreur">
<td colspan="4" data-label="Livreur">🛵 <strong>${collecteLivreurLabel(l.id) || 'Livreur inconnu'}</strong>
· ${l.nb} colis · <strong>${escapeHTML(formatMontant(l.valeur))}</strong>
· le plus vieux : ${escapeHTML(ageColisEnMainTexte(l.plusVieuxJours, l.plusVieuxCertain))}</td>
</tr>`);
/* POUVOIR AGIR, PAS SEULEMENT CONSTATER (17/09/2026, point 7.7)
   Cet écran affichait « 71 colis immobilisés » et ne proposait rien : pour en ouvrir un, il
   fallait retenir son numéro, aller dans l'onglet Colis, le chercher. Personne ne le faisait.
   Chaque ligne mène maintenant à la fiche du colis, là où on peut relancer le livreur, changer
   le statut ou corriger l'adresse. Le tableau reste un tableau ; c'est la ligne qui agit. */
l.colis.forEach(r => {
lignes.push(`<tr class="ligne-cliquable" data-ouvrir-colis="${escapeHTML(r.colis.id)}" title="Ouvrir la fiche de ce colis">
<td data-label="Colis">${escapeHTML(r.numero || '—')}</td>
<td data-label="Cliente">${escapeHTML(fournisseurLabelPlain(r.colis.fournisseur_id) || '—')}</td>
<td data-label="Dort depuis">${escapeHTML(ageColisEnMainTexte(r.jours, r.certain))}</td>
<td data-label="Valeur">${escapeHTML(formatMontant(r.valeur) || '—')} <span class="ligne-fleche" aria-hidden="true">›</span></td>
</tr>`);
});
});

// La note du bas n'est écrite QUE s'il y a des âges incertains, et elle dit combien. Une note
// permanente finit par ne plus être lue ; une note qui apparaît avec un chiffre se lit encore.
const note = releve.total.nbAgeIncertain
? `<div class="recap-bilan-note">
« Au moins » veut dire ce qu'il dit : pour ${releve.total.nbAgeIncertain} de ces colis, la base ne garde
aucune date de récupération — ils sont passés à ce statut avant le 27 août, quand cette date a
commencé à être posée. On compte alors depuis leur enregistrement, ce qui donne un minimum sûr,
jamais une date inventée. Le colis dort <strong>au moins</strong> ce temps-là, peut-être moins longtemps.
</div>`
: '';

cltPoserHTML(body, `<div class="recap-day-summary">Colis récupérés depuis plus de ${releve.total.seuilJours} jours et toujours pas livrés · <strong>${releve.total.nbColis}</strong> colis chez <strong>${releve.total.nbLivreurs}</strong> livreur${releve.total.nbLivreurs > 1 ? 's' : ''}</div>
<div class="recap-table-wrap">
<table class="recap-table recap-table-cards">
<thead><tr><th>Colis</th><th>Cliente</th><th>Dort depuis</th><th>Valeur</th></tr></thead>
<tbody>${lignes.join('')}</tbody>
${piedTotalHTML([
{ texte: `TOTAL — ${releve.total.nbColis} colis`, label: 'Colis' },
{ texte: '' },
{ texte: escapeHTML(ageColisEnMainTexte(releve.total.plusVieuxJours, releve.total.plusVieuxCertain)) + ' au plus vieux', label: 'Dort depuis' },
{ texte: escapeHTML(formatMontant(releve.total.valeur)), label: 'Valeur' },
])}
</table></div>
${note}`);
}


/* ============================================================================================
   LE RELEVÉ DU SOIR D'UNE CLIENTE — PDF, Excel, Word, et l'envoi
   ============================================================================================
   Demandé le 26 août 2026 : « lorsque tu cliques sur une cliente, tu as son récapitulatif et
   juste en bas, tu as la possibilité de pouvoir imprimer […] c'est ce qu'on va prendre pour
   pouvoir les envoyer chaque soir pour dire voilà ce qu'on a récupéré, ce qu'on a pu livrer,
   avec les détails ».

   Les quatre boutons ci-dessous ne recalculent RIEN. Ils appellent releveCliente() dans
   config.js, exactement comme le tableau affiché juste au-dessus d'eux. Le fichier qui part
   chez la vendeuse et l'écran qu'on a sous les yeux ne peuvent donc pas annoncer deux sommes
   différentes : il n'y a qu'une addition, écrite une seule fois.

   Le Word n'ajoute aucune bibliothèque. C'est un document HTML servi sous le type MIME de
   Word : Word, Google Docs et WPS l'ouvrent et le laissent modifier. Charger 500 Ko de plus
   sur un téléphone en 3G pour gagner l'extension « x » n'aurait pas été un bon échange.
   ============================================================================================ */

// Rassemble tout ce dont les quatre sorties ont besoin : qui, quel jour, et le relevé lui-même.
// Renvoie null si aucune cliente n'est ouverte — les boutons n'existent que dans son bilan.
function releveEnCours(){
const fid = recapSelectedFournisseur;
if (!fid) return null;
const date = recapGetDate();
const list = recapDayColis().filter(c => (c.fournisseur_id || 'inconnu') === fid);
return { fid, nom: fournisseurLabelPlain(fid), date, dateLabel: recapDayLabel(date), r: releveCliente(list) };
}

/* LA MARQUE « POINT ENVOYÉ ». (18/09/2026, Celtis : « il faut qu'il y ait la possibilité de
   cocher, pour que les autres puissent s'en apercevoir »)

   ELLE SE COCHE À LA MAIN, ET C'EST VOULU. Télécharger le PDF n'est pas l'envoyer : on le
   télécharge aussi pour le relire. Une marque posée toute seule au téléchargement mentirait, et
   une marque à laquelle on ne peut pas se fier ne sert à rien — c'est pire que pas de marque,
   parce qu'on cesse alors de vérifier.

   MAIS ON NE COMPTE PAS SUR LA MÉMOIRE DE PERSONNE : dès qu'un fichier est sorti ou partagé, le
   bouton passe en évidence (`a-envoyer`) avec « Je viens de l'envoyer ». Un appui, et c'est
   marqué. L'application demande, elle n'affirme pas.

   Une fois cochée, la marque dit QUI et QUAND — c'est toute la question de Celtis : quelqu'un
   qui arrive doit pouvoir vérifier sans demander à personne. Et elle se décoche, parce qu'on
   coche parfois la mauvaise ligne. */
function releveMarqueHTML(){
const d = releveEnCours();
if (!d) return '';
const marques = (typeof recapMarques === 'function') ? recapMarques(d.date) : null;
// Marques pas encore lues (ou table absente) : aucun bouton. Proposer « marquer » sans savoir
// si c'est déjà fait ferait poser une seconde marque par-dessus la première.
if (!marques) return '';
const m = marques[d.fid];
if (m) {
  return `<div class="releve-marque releve-marque--oui">
    <span class="releve-marque__dit">✅ Point envoyé ${escapeHTML(recapQuandParQui(m))}</span>
    <button type="button" class="btn btn-outline btn-sm" id="releve-demarquer" title="Décocher : le point n'avait pas été envoyé">↩︎ Ce n'était pas envoyé</button>
  </div>`;
}
return `<div class="releve-marque">
  <button type="button" class="btn btn-outline btn-sm" id="releve-marquer">✅ Je viens de l'envoyer</button>
  <span class="releve-marque__aide">Cochez après l'envoi : l'équipe verra que cette cliente a eu son point.</span>
</div>`;
}

function releveBarreHTML(){
return `
<div class="releve-barre">
<div class="releve-barre-label">Relevé du soir — à envoyer à la cliente</div>
<div class="releve-barre-boutons">
<button type="button" class="btn btn-primary btn-sm" id="releve-envoyer" title="Le PDF du point, avec un mot d'accompagnement déjà écrit.">📤 Envoyer le PDF par WhatsApp</button>
<button type="button" class="btn btn-outline btn-sm" id="releve-pdf">🖨️ PDF</button>
<button type="button" class="btn btn-outline btn-sm" id="releve-excel">📊 Excel</button>
<button type="button" class="btn btn-outline btn-sm" id="releve-word">📝 Word</button>
<button type="button" class="btn btn-outline btn-sm" id="releve-message" title="Ouvre sa conversation WhatsApp avec le point écrit en toutes lettres, sans fichier.">💬 Message seul</button>
</div>
${releveMarqueHTML()}
</div>`;
}

// Un fichier vient de sortir : on met le bouton en évidence, sans rien affirmer.
function releveRappelerDeCocher(){
const b = document.getElementById('releve-marquer');
if (b) b.classList.add('a-envoyer');
}

async function releveMarquer(){
const d = releveEnCours();
if (!d) return;
const btn = document.getElementById('releve-marquer');
if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
const { error } = await supabaseClient.rpc('marquer_point_envoye', { p_fournisseur: d.fid, p_jour: d.date });
if (error) {
  console.error('Point envoyé :', error);
  if (btn) { btn.disabled = false; btn.textContent = '✅ Je viens de l\'envoyer'; }
  cltToast(error.message || "La marque n'a pas pu être enregistrée.", { type: 'error' });
  return;
}
cltToast(`Point de ${d.nom} marqué comme envoyé.`, { type: 'success' });
if (typeof recapChargerPointsEnvoyes === 'function') await recapChargerPointsEnvoyes(d.date, true);
}

async function releveDemarquer(){
const d = releveEnCours();
if (!d) return;
const ok = (typeof cltConfirm === 'function') ? await cltConfirm({
  title: 'Ce point n\'a pas été envoyé ?',
  detail: `${d.nom} — ${d.dateLabel}`,
  sub: "La marque est retirée et l'équipe reverra cette cliente dans celles à faire. Le geste reste au journal.",
  okLabel: 'Oui, retirer la marque', cancelLabel: 'Garder',
}) : true;
if (!ok) return;
const { error } = await supabaseClient.rpc('demarquer_point_envoye', { p_fournisseur: d.fid, p_jour: d.date });
if (error) { console.error(error); cltToast(error.message || "La marque n'a pas pu être retirée.", { type: 'error' }); return; }
cltToast('Marque retirée.', { type: 'info' });
if (typeof recapChargerPointsEnvoyes === 'function') await recapChargerPointsEnvoyes(d.date, true);
}

// « le 18 septembre à 19 h 42, par Awa » — écrit une fois, lu sur la vignette comme dans la barre.
function recapQuandParQui(m){
if (!m) return '';
const quand = m.le ? new Date(m.le) : null;
const heure = quand && !isNaN(quand.getTime())
  ? quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan' }).replace(':', ' h ')
  : '';
// Le nom vient avec la marque (recapChargerPointsEnvoyes). Vide s'il n'a pas pu être lu : on
// dit alors l'heure seule plutôt que d'inventer un nom.
const qui = m.parNom || '';
return [heure ? 'à ' + heure : '', qui ? 'par ' + qui : ''].filter(Boolean).join(', ');
}

// Le bouton « Envoyer » ne s'affiche que sur un appareil qui sait réellement partager un
// fichier. Un bouton présent qui ne fait rien serait pire que pas de bouton du tout : le soir,
// en fin de journée, on appuierait trois fois avant de comprendre.
function releveEnvoiPossible(){
try {
return !!(navigator.canShare && navigator.share &&
navigator.canShare({ files: [new File([new Blob(['x'], { type: 'text/plain' })], 'test.txt', { type: 'text/plain' })] }));
} catch (e) { return false; }
}

function brancherReleveBarre(){
const pdf = document.getElementById('releve-pdf');
const xls = document.getElementById('releve-excel');
const doc = document.getElementById('releve-word');
const env = document.getElementById('releve-envoyer');
// Chaque sortie met le bouton « Je viens de l'envoyer » en évidence : c'est le moment où la
// personne l'a en tête. (18/09/2026)
if (pdf) pdf.addEventListener('click', () => { telechargerRelevePDF(); releveRappelerDeCocher(); });
if (xls) xls.addEventListener('click', () => { telechargerReleveExcel(); releveRappelerDeCocher(); });
if (doc) doc.addEventListener('click', () => { telechargerReleveWord(); releveRappelerDeCocher(); });
// 20/09/2026, Celtis : « derrière le bouton Envoyer, il faut que ce soit SON WhatsApp ; qu'on n'ait
// pas à choisir quoi faire, ou quel compte ». « Envoyer » ouvre donc la conversation de cette
// cliente, le point déjà écrit (point-par-whatsapp.js) — sur téléphone comme sur ordinateur. La
// feuille de partage, qui sait joindre le PDF mais fait choisir l'application et le contact,
// devient le second bouton, et seulement là où elle existe.
// 21/09/2026, Celtis : « il faut que ça parte avec le fichier PDF, comme au départ ; si ce n'est
// pas possible [contact + fichier], on revient à l'ancien système », avec un mot d'accompagnement
// clair (bonjour/bonsoir, la journée, la somme). « Envoyer » partage donc LE PDF ; le point écrit
// en toutes lettres, qui ouvre droit sa conversation, devient « Message seul ».
if (env) env.addEventListener('click', () => { envoyerRelevePDF(); releveRappelerDeCocher(); });
const msg = document.getElementById('releve-message');
if (msg) msg.addEventListener('click', () => { envoyerPointSurWhatsApp(); releveRappelerDeCocher(); });
const marquer = document.getElementById('releve-marquer');
if (marquer) marquer.addEventListener('click', releveMarquer);
const demarquer = document.getElementById('releve-demarquer');
if (demarquer) demarquer.addEventListener('click', releveDemarquer);
}

// Les lignes du tableau, en texte, dans l'ordre des colonnes. Écrites une fois pour les trois
// fichiers : un tiret cadratin là où l'écran affiche un tiret cadratin.
function releveLignesTexte(r){
return r.lignes.map(l => [
l.telephone || '—',
l.adresse || '—',
l.statut,
formatMontant(l.article) || '0 FCFA',
releveVousRevientTexte(l),
l.observation || '—',
]);
}

// ---- PDF ----
// La forme du tableau, écrite une fois, servie au relevé d'une cliente comme à l'export de la
// journée entière. Toute chaîne écrite dans un PDF passe par texteAplatiPourPDF : sans elle,
// l'espace fine des milliers ressort en barre oblique et « 15 000 FCFA » devient « 15 /000 FCFA ».
// Les couleurs, les filets et les marges ne sont plus écrits ici : styleTableauCLT() les pose
// pour tous les documents de la maison. Ne restent que les deux choses qui appartiennent
// vraiment à ce tableau-là — ce qu'il contient, et la largeur de ses colonnes.
// LES SIX colonnes ont une largeur, et elles totalisent les 182 mm imprimables. Ce n'est pas
// du zèle : le récapitulatif par client empile un tableau par cliente sur la même feuille, et
// tant que deux colonnes restaient libres, autoTable les recalculait pour CHAQUE tableau
// d'après son propre contenu. Vu le 29 août 2026 : quatre tableaux des six mêmes colonnes, et
// pas une qui tombait sous la précédente. L'œil devait se recaler à chaque cliente.
//
// Largeurs mesurées, pas devinées, à la taille 9 en gras avec 5 mm de marge intérieure —
// c'est la ligne TOTAL qui est en gras, et c'est elle qui déborde en premier : un numéro de
// téléphone demande 26,0 mm, « 12 / 15 livré(s) » 25,9 et « 1 250 000 FCFA » 28,1.
//
// Les deux colonnes d'argent passent de 27 et 25 à 28. L'ancienne colonne « Encaissé » était
// trop étroite de 0,45 mm : mesuré, « 196 500 FCFA » en gras en réclame 25,45, et la colonne
// en offrait 25. Toute cliente au-dessus de 100 000 FCFA voyait donc son total coupé en deux.
// Personne ne l'avait vu parce qu'aucune cliente du banc ne dépassait ce montant.
//
// Elles sont écrites UNE FOIS, ici : le tableau de chaque cliente et la bande « TOTAL DE LA
// JOURNÉE » qui ferme le document lisent le même objet. Deux listes de largeurs recopiées
// finiraient par diverger, et c'est précisément ce désalignement qu'on répare.
const RELEVE_COLONNES_PDF = {
0: { cellWidth: 27 },
1: { cellWidth: 31 },
2: { cellWidth: 26 },
3: { cellWidth: 28, halign: 'right' },
4: { cellWidth: 28, halign: 'right' },
5: { cellWidth: 42 },
};

function releveTableauPDF(r){
return {
head: [r.colonnes],
body: releveLignesTexte(r),
foot: [releveTotalTextes(r)],
// La marge intérieure de 2,5 mm n'est pas un réglage d'apparence : les largeurs ci-dessus ont
// été mesurées avec elle. La changer recouperait la ligne TOTAL en deux.
styles: { cellPadding: 2.5 },
// « Article » et « Encaissé » sont déclarées colonnes d'argent alors que leur largeur est déjà
// fixée : ce n'est pas pour la largeur, c'est pour que l'alignement à droite descende jusqu'à la
// ligne TOTAL. Les largeurs écrites ci-dessus gardent le dernier mot.
colonnesArgent: [3, 4],
columnStyles: RELEVE_COLONNES_PDF,
// Les couleurs de l'écran : le statut dans sa pastille, l'encaissé en vert. (05/09/2026)
// « Soldé » occupe la colonne d'argent sans être un montant : il prend le bleu de sa pastille et
// non le vert de ce qui revient à la cliente. (18/09/2026)
colorier: { statut: { colonne: 2, codes: r.lignes.map(l => l.statutCode || '') }, argent: [4], mots: { 'Soldé': '#1B4374' } },
};
}

// Le relevé du soir passe désormais par documentCLT() : il n'écrit plus lui-même son en-tête, ne
// place plus ses titres au millimètre et ne décide plus de ses sauts de page. Il dit ce qu'il a
// à dire, le papier à en-tête de la maison s'occupe du reste — et la feuille se raccourcit
// d'elle-même quand la cliente n'a que deux colis. La promesse est celle du logo ; les deux
// appelants l'attendent.
function releveConstruirePDF(d){
return documentCLT({
titre: 'Relevé du soir',
sousTitre: d.nom,
mention: `${d.dateLabel}  ·  ${d.r.nb} colis  ·  ${d.r.nbLivres} livré(s)`,
tableau: releveTableauPDF(d.r),
apres: [
// La phrase due reste en vert : c'est la seule ligne que la vendeuse lit vraiment.
// En rouge quand c'est ELLE qui doit — le sens s'inverse, la couleur suit, sans quoi une
// somme à payer se lirait comme une somme à recevoir.
{ texte: relevePhraseDue(d.r), taille: 12, gras: true,
  couleur: Number(d.r.totalEncaisse) < 0 ? [192, 57, 43] : [26, 125, 60] },
].concat(releveDetailRetenues(d.r)
  ? [{ texte: releveDetailRetenues(d.r), taille: 9.5, gras: true, couleur: COULEUR_NEGATIF_PDF, avant: 3 }]
  : []
// D'où vient chaque retenue (18/09/2026) : une ligne par colis, sous la phrase qui en donne le
// total. Sans elle, la cliente lit « −1 000 FCFA » sans savoir sur quel colis regarder.
).concat(releveRetenuesLignesTexte(d.r).map(t => (
  { texte: '• ' + t, taille: 9, couleur: COULEUR_NEGATIF_PDF, avant: 1 }
))).concat([
{ texte: RELEVE_NOTE, taille: 8, avant: 8 },
]),
});
}

async function telechargerRelevePDF(){
const d = releveEnCours();
if (!d) return;
const doc = await releveConstruirePDF(d);
doc.save(releveNomFichier(d.nom, d.date) + '.pdf');
}

// ---- Excel ----
// Les montants partent en NOMBRES et non en texte : une vendeuse qui veut refaire l'addition
// dans son tableur doit pouvoir la refaire. Ce sont les mêmes nombres que ceux du PDF, pris
// au même endroit ; seule la mise en forme diffère.
function telechargerReleveExcel(){
const d = releveEnCours();
if (!d) return;
const aoa = [];
aoa.push(['Relevé du soir — Christ Livraison & Transport SARL']);
aoa.push([d.nom]);
aoa.push([d.dateLabel]);
aoa.push([`${d.r.nb} colis · ${d.r.nbLivres} livré(s)`]);
aoa.push([]);
aoa.push(d.r.colonnes);
d.r.lignes.forEach(l => {
// Le montant part en NOMBRE, pour rester calculable dans le tableur. Quand il n'y en a pas,
// c'est le mot qui part — « Soldé » ou le tiret — exactement comme sur le PDF et à l'écran.
aoa.push([l.telephone || '', l.adresse || '', l.statut, l.article, l.encaisse || releveVousRevientTexte(l), l.observation || '']);
});
aoa.push(['TOTAL', '', d.r.nbLivres + ' / ' + d.r.nb + ' livré(s)', d.r.totalArticle, d.r.totalEncaisse, '']);
aoa.push([]);
aoa.push([relevePhraseDue(d.r)]);
if (releveDetailRetenues(d.r)) aoa.push([releveDetailRetenues(d.r)]);
releveRetenuesLignesTexte(d.r).forEach(t => aoa.push([t]));
aoa.push([RELEVE_NOTE]);
const ws = XLSX.utils.aoa_to_sheet(aoa);
ws['!cols'] = [{ wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 32 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Relevé');
XLSX.writeFile(wb, releveNomFichier(d.nom, d.date) + '.xlsx');
}

// ---- Word ----
// Document HTML servi sous le type MIME de Word. Aucune bibliothèque, aucune empreinte externe
// de plus à surveiller, et le fichier reste modifiable dans Word comme dans Google Docs.
function releveConstruireWordHTML(d){
const th = d.r.colonnes.map(c => `<th>${escapeHTML(c)}</th>`).join('');
const trs = releveLignesTexte(d.r).map(cells =>
`<tr>${cells.map((v, i) => `<td${i >= 3 && i <= 4 ? ' align="right"' : ''}${estMontantNegatifTexte(v) ? ' class="neg"' : (String(v) === 'Soldé' ? ' class="solde"' : '')}>${escapeHTML(String(v))}</td>`).join('')}</tr>`
).join('');
const tot = releveTotalTextes(d.r).map((v, i) =>
`<td${i >= 3 && i <= 4 ? ' align="right"' : ''} class="tot${estMontantNegatifTexte(v) ? ' neg' : ''}">${escapeHTML(String(v))}</td>`).join('');
return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8">
<title>${escapeHTML(d.nom)} — ${escapeHTML(d.dateLabel)}</title>
<style>
@page{size:A4;margin:2cm;}
body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#111;}
h1{font-size:14pt;color:#1B4374;margin:0 0 4pt;}
h2{font-size:13pt;margin:0 0 2pt;}
.sous{font-size:10pt;color:#555;margin:0 0 12pt;}
table{border-collapse:collapse;width:100%;font-size:10pt;}
th{background:#1B4374;color:#fff;text-align:left;padding:5pt 6pt;border:1px solid #1B4374;}
td{padding:5pt 6pt;border:1px solid #c9d2dd;vertical-align:top;}
td.tot{background:#eef0f3;color:#1B4374;font-weight:bold;}
td.neg{color:#c0392b;font-weight:bold;}
td.solde{color:#1B4374;font-weight:bold;}
.due{margin-top:14pt;font-size:12pt;font-weight:bold;color:#1a7d3c;}
.retenues{margin-top:4pt;font-size:9.5pt;font-weight:bold;color:#c0392b;}
.note{margin-top:10pt;font-size:8.5pt;color:#6e6e6e;}
</style></head>
<body>
<h1>Relevé du soir — Christ Livraison &amp; Transport SARL</h1>
<h2>${escapeHTML(d.nom)}</h2>
<p class="sous">${escapeHTML(d.dateLabel)} · ${d.r.nb} colis · ${d.r.nbLivres} livré(s)</p>
<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody><tfoot><tr>${tot}</tr></tfoot></table>
<p class="due" ${Number(d.r.totalEncaisse) < 0 ? 'style="color:#c0392b;"' : ''}>${escapeHTML(relevePhraseDue(d.r))}</p>
${releveDetailRetenues(d.r) ? `<p class="retenues">${escapeHTML(releveDetailRetenues(d.r))}</p>` : ''}
${releveRetenuesLignesTexte(d.r).length ? `<ul class="retenues">${releveRetenuesLignesTexte(d.r).map(t => `<li>${escapeHTML(t)}</li>`).join('')}</ul>` : ''}
<p class="note">${escapeHTML(RELEVE_NOTE)}</p>
</body></html>`;
}

function telechargerReleveWord(){
const d = releveEnCours();
if (!d) return;
// Le préfixe BOM évite que Word lise le fichier en Latin-1 et transforme les accents en charabia.
const blob = new Blob(['\ufeff' + releveConstruireWordHTML(d)], { type: 'application/msword' });
releveTelechargerBlob(blob, releveNomFichier(d.nom, d.date) + '.doc');
}

function releveTelechargerBlob(blob, nom){
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = nom;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ---- « Envoyer » : droit dans le WhatsApp de la cliente, le point déjà écrit ----
function envoyerPointSurWhatsApp(){
const d = releveEnCours();
if (!d || !window.CLTPointWhatsApp) return;
const f = fournisseurs.find(x => x.id === d.fid);
const texte = CLTPointWhatsApp.texteDuPoint(d, { releveVousRevientTexte, relevePhraseDue });
const lien = CLTPointWhatsApp.lienWhatsApp(f && f.phone, texte);
if (!lien) {
// Pas de numéro utilisable sur le compte : on le dit, et on retombe sur le partage du fichier.
if (window.cltToast) cltToast("Ce compte n'a pas de numéro WhatsApp utilisable. Corrigez son téléphone dans Comptes, ou partagez le PDF.", { type: 'info' });
if (releveEnvoiPossible()) envoyerRelevePDF(); else telechargerRelevePDF();
return;
}
window.open(lien, '_blank', 'noopener');
}

// ---- Partage du fichier (la feuille du téléphone), avec le PDF déjà attaché ----
async function envoyerRelevePDF(){
const d = releveEnCours();
if (!d) return;
const nom = releveNomFichier(d.nom, d.date) + '.pdf';
const heure = Number(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', hour12: false, timeZone: 'Africa/Abidjan' }).slice(0, 2));
const mot = window.CLTPointWhatsApp ? CLTPointWhatsApp.texteAvecLePDF(d, { relevePhraseDue }, heure) : relevePhraseDue(d.r);
const partageDeFichiers = !!navigator.canShare && navigator.canShare({ files: [new File([''], nom, { type: 'application/pdf' })] });
if (!partageDeFichiers) {
  // Sur ordinateur, aucun partage de fichier : SA conversation s'ouvre tout de suite (avant toute
  // attente, sinon le navigateur bloque la fenêtre), le mot déjà écrit, et le PDF se télécharge —
  // il ne reste qu'à l'y glisser.
  const f = fournisseurs.find(x => x.id === d.fid);
  const lien = window.CLTPointWhatsApp ? CLTPointWhatsApp.lienWhatsApp(f && f.phone, mot) : '';
  if (lien) window.open(lien, '_blank', 'noopener');
  if (window.cltToast) cltToast(lien
    ? 'Sa conversation WhatsApp est ouverte, le message est déjà écrit : glissez-y le PDF qui vient de se télécharger.'
    : 'Le PDF se télécharge. Cette cliente n\'a pas de numéro sur son compte : envoyez-le depuis votre WhatsApp.', { type: 'info', title: 'Presque fini', duration: 9000 });
  try { await telechargerRelevePDF(); } catch (e) { console.warn('[point] PDF non construit', e); }
  return;
}
try {
const blob = (await releveConstruirePDF(d)).output('blob');
const fichier = new File([blob], nom, { type: 'application/pdf' });
await navigator.share({ files: [fichier], title: d.nom + ' — ' + d.dateLabel, text: mot });
} catch (e) {
// L'utilisateur qui referme la feuille de partage déclenche AbortError : ce n'est pas une panne.
if (e && e.name === 'AbortError') return;
try { await telechargerRelevePDF(); } catch (e2) { console.warn('[point] PDF non construit', e2); }
}
}

// ---- Export du récapitulatif du jour (toutes les clientes, une section par cliente) ----
// Utilisé pour télécharger la journée en PDF ou en Excel et l'envoyer aux clientes.
// L'export porte toujours sur TOUTE la journée sélectionnée (indépendamment de la recherche).
//
// Corrigé le 26 août 2026. Il ne sortait qu'une colonne « Montant » valant l'article enregistré,
// et son total additionnait les colis livrés ET non livrés : le document annonçait donc plus
// d'argent que l'écran n'en réclamait. Il passe maintenant par releveCliente(), comme le bilan
// affiché et comme le relevé par cliente, avec la colonne « Encaissé » et une ligne TOTAL.
/* recapStatutLabel() était un second nom pour statutTexte() — jamais appelé. Retiré le
   17/09/2026 : un même chiffre ne doit pas avoir deux noms (points 9.7 et 9.4). */

// Regroupe les colis du jour par cliente (fournisseur_id), triées par nombre de colis décroissant.
// Chaque groupe porte son relevé complet, calculé par releveCliente() — la même fonction que le
// bilan affiché à l'écran. `total` reste l'article enregistré, pour les appelants historiques.
function recapDayGroups(colisJour){
const map = {};
colisJour.forEach(c => {
const key = c.fournisseur_id || 'inconnu';
if (!map[key]) map[key] = { id: key, name: fournisseurLabelPlain(key), colis: [] };
map[key].colis.push(c);
});
return Object.values(map)
.map(g => { const r = releveCliente(g.colis); return Object.assign(g, { r, total: r.totalArticle }); })
.sort((a, b) => b.colis.length - a.colis.length);
}

function recapExportBaseName(){
return `recapitulatif-${recapGetDate()}`;
}

function recapExportBarHTML(){
return `
<div class="recap-export-bar">
<span class="recap-export-label">Télécharger la journée :</span>
<button type="button" class="btn btn-outline btn-sm" id="recap-export-pdf">🖨️ PDF</button>
<button type="button" class="btn btn-outline btn-sm" id="recap-export-excel">📊 Excel</button>
</div>`;
}

function wireRecapExport(){
const pdf = document.getElementById('recap-export-pdf');
const xls = document.getElementById('recap-export-excel');
if (pdf) pdf.addEventListener('click', exportRecapDayPDF);
if (xls) xls.addEventListener('click', exportRecapDayExcel);
}

// Excel : une feuille, un titre + la date, puis une section par cliente (nom, colonnes, colis, sous-total).
function exportRecapDayExcel(){
const colisJour = recapDayColis();
if (!colisJour.length) { cltToast("Aucune cliente enregistrée pour ce jour.", { type: 'warning' }); return; }
const groups = recapDayGroups(colisJour);
const dateLabel = recapDayLabel(recapGetDate());
const tJour = totauxArgent(colisJour);
const aoa = [];
aoa.push(['Récapitulatif par client — Christ Livraison & Transport SARL']);
aoa.push([dateLabel]);
aoa.push([`${groups.length} cliente(s) · ${colisJour.length} colis · ${tJour.nbLivres} livré(s)`]);
aoa.push([]);
groups.forEach(g => {
aoa.push([g.name]);
aoa.push(g.r.colonnes);
g.r.lignes.forEach(l => {
// Le montant part en NOMBRE, pour rester calculable dans le tableur. Quand il n'y en a pas,
// c'est le mot qui part — « Soldé » ou le tiret — exactement comme sur le PDF et à l'écran.
aoa.push([l.telephone || '', l.adresse || '', l.statut, l.article, l.encaisse || releveVousRevientTexte(l), l.observation || '']);
});
aoa.push(['TOTAL', '', g.r.nbLivres + ' / ' + g.r.nb + ' livré(s)', g.r.totalArticle, g.r.totalEncaisse, '']);
aoa.push([]);
});
aoa.push(['TOTAL DE LA JOURNÉE', '', tJour.nbLivres + ' / ' + tJour.nb + ' livré(s)',
Number(tJour.articleEnregistre) || 0, Number(tJour.articleEncaisse) || 0, '']);
aoa.push([]);
aoa.push([RELEVE_NOTE]);
const ws = XLSX.utils.aoa_to_sheet(aoa);
ws['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 32 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Récapitulatif');
XLSX.writeFile(wb, `${recapExportBaseName()}.xlsx`);
}

// PDF : une section par cliente (son nom, son total, puis le tableau de ses colis), et le TOTAL
// DE LA JOURNÉE en dernière section. Les sauts de page ne sont plus décidés ici à coups de
// « si y > 258 » : documentCLT() sait où finit la feuille, et ne laisse plus un nom de cliente
// tout seul en bas d'une page pendant que son tableau part sur la suivante.
async function exportRecapDayPDF(){
const colisJour = recapDayColis();
if (!colisJour.length) { cltToast("Aucune cliente enregistrée pour ce jour.", { type: 'warning' }); return; }
const groups = recapDayGroups(colisJour);
const dateLabel = recapDayLabel(recapGetDate());
const tJour = totauxArgent(colisJour);

const sections = groups.map(g => ({
titre: `${g.name}  —  ${g.r.nbLivres} / ${g.r.nb} livré(s) · encaissé ${formatMontant(g.r.totalEncaisse) || '0 FCFA'}`,
tableau: releveTableauPDF(g.r),
}));

// Le total de la journée ferme le document. Il n'est jamais facultatif : un récapitulatif
// d'argent sans total oblige la personne qui le lit à refaire l'addition à la main.
//
// Il est écrit sur LA MÊME GRILLE que les tableaux des clientes : mêmes six colonnes, mêmes
// largeurs, même taille, même marge intérieure. Vu et mesuré le 29 août 2026 : la bande était
// jusque-là un cinquième tableau à quatre colonnes libres, ses montants finissaient à 404,6 et
// 517,1 pt quand ceux des clientes finissaient à 338,9 et 418,3, et son argent était collé à
// gauche. C'est pourtant la somme de tout ce qui précède : elle doit se vérifier à l'œil en
// descendant la colonne, pas se relire de travers. Le libellé prend les deux premières colonnes
// ensemble, faute de tenir dans les 27 mm du téléphone. Ce qui la distingue des lignes TOTAL des
// clientes est son fond, plus soutenu, et son libellé.
sections.push({ tableau: {
body: [[
{ content: 'TOTAL DE LA JOURNÉE', colSpan: 2 },
tJour.nbLivres + ' / ' + tJour.nb + ' livré(s)',
formatMontant(tJour.articleEnregistre) || '0 FCFA',
formatMontant(tJour.articleEncaisse) || '0 FCFA',
'',
]],
styles: { fontSize: 9, cellPadding: 2.5, fontStyle: 'bold', textColor: [27, 67, 116], fillColor: [225, 230, 238] },
columnStyles: RELEVE_COLONNES_PDF,
} });

const doc = await documentCLT({
titre: 'Récapitulatif par client',
sousTitre: dateLabel,
mention: `${groups.length} cliente(s)  ·  ${colisJour.length} colis  ·  ${tJour.nbLivres} livré(s)`,
sections,
apres: [
{ texte: `Articles enregistrés : ${formatMontant(tJour.articleEnregistre) || '0 FCFA'}  ·  Articles encaissés : ${formatMontant(tJour.articleEncaisse) || '0 FCFA'}`, taille: 10, gras: true, couleur: [27, 67, 116] },
{ texte: RELEVE_NOTE, taille: 8, avant: 8 },
],
});
doc.save(`${recapExportBaseName()}.pdf`);
}

// groupColisByDayLegacyReport() et dayLabelLegacyReport() ont été retirées le 26 août 2026.
// Elles groupaient les colis par date d'enregistrement, en découpant la chaîne à la main
// (« iso.slice(0,10) ») — la troisième notion de « jour » de l'application, après dayKey() et
// jourAbidjan(). Elles ne servaient plus qu'à la vue par jour, qui compte désormais au jour de
// l'événement. Les laisser en place, c'était offrir à la prochaine personne pressée un
// découpage tout prêt et faux. Le bon est jourAbidjan(), dans config.js.

function colisMiniHTML(c){
const thumb = c.photo_url
? `<img src="${c.photo_url}" class="thumb" alt="Photo du colis${c.description ? ' : ' + escapeHTML(c.description) : ''}">`
: `<div class="thumb-placeholder">Pas de photo</div>`;
return `
<div class="colis-item">
${thumb}
<div class="info">
<div class="desc">${colisDestinationHTML(c)}</div>
${colisDescriptionTexte(c) ? `<div class="meta colis-quoi">📦 ${escapeHTML(colisDescriptionTexte(c))}</div>` : ''}
${eqLigneClientHTML(c)}
${eqLigneDestinationHTML(c)}
${eqBoutonsAppelHTML(c)}
${c.commune_recuperation ? `<div class="meta" style="color:var(--accent, #E26313); font-weight:600;">📍 Récupération : ${escapeHTML(c.commune_recuperation)}${c.adresse_recuperation ? ' — ' + escapeHTML(c.adresse_recuperation) : ''}</div>` : ''}
<div class="meta">${formatDate(c.created_at)}</div>
${c.observation ? `<div class="obs-display"><strong>Observation :</strong> ${escapeHTML(c.observation)}</div>` : ''}
${c.photo_livraison_url ? `<div class="meta">Preuve de livraison : <img src="${c.photo_livraison_url}" class="thumb" style="vertical-align:middle; margin-left:6px;" alt="Photo de preuve de livraison"></div>` : ''}
</div>
<div class="status-col">${statutBadgeHTML(c.statut, c)}</div>
</div>
`;
}

/* ============================================================================================
   RAPPORT « VUE PAR JOUR »

   Ce que cet onglet répond : ce jour-là, chaque livreur a reçu combien de colis, en a livré
   combien, en a manqué combien, et combien lui restent sur les bras.

   Il a été refait le 26 août 2026 parce qu'il ne répondait à aucune de ces questions. Il
   groupait les colis par DATE D'ENREGISTREMENT et écrivait une seule chose par journée —
   « 12 colis » — puis déroulait les fiches. Deux défauts, pas un :

     • La date était fausse. Un colis enregistré le 24 et livré le 26 était compté au 24. Le
       jour de l'enregistrement était gonflé, le jour du travail était vide, et aucun des deux
       chiffres ne décrivait une journée réelle.
     • Le comptage se faisait sur `allColis`, qui ne contient que la première page tant qu'on
       n'a pas cliqué sur « Charger plus ». Une journée un peu ancienne était donc sous-comptée
       en silence — et l'onglet « Par livreur », lui, interrogeait la base. Les deux écrans se
       contredisaient sans que rien ne le signale.

   Tout le calcul est dans config.js (colisDuJourParLivreur & co.) : c'est là que sont définis
   le jour d'Abidjan, le sens de chaque colonne et la ligne TOTAL, et c'est là que le banc
   d'essai tests/colis-par-jour-et-par-livreur.test.mjs va les vérifier. Ici, on ne fait que
   choisir la journée, aller chercher les colis, appeler ces calculs et habiller le résultat.
   Aucune addition n'est refaite dans ce fichier.
   ============================================================================================ */

// La journée regardée, au sens d'Abidjan. Par défaut : aujourd'hui.
function jourRapportChoisi(){
const input = document.getElementById('jour-select');
return (input && input.value) || aujourdhuiAbidjan();
}

// Les colis qui ont bougé ce jour-là.
//
// Quatre requêtes plutôt qu'une : chaque colonne d'horodatage a son propre intervalle, et une
// condition unique mélangeant quatre plages « ou » se lit mal, se teste mal, et se casse en
// silence à la première faute de frappe. Quatre lectures indexées coûtent moins cher qu'un
// chiffre faux. Les résultats sont fusionnés par identifiant : un colis reçu le matin et livré
// l'après-midi remonte deux fois et ne doit être compté qu'une.
//
// On interroge la base plutôt que `allColis`, pour la raison écrite plus haut.
async function colisDuJourDepuisLaBase(jour){
if (!jour) return [];
const debut = jour + 'T00:00:00Z';
const fin   = jour + 'T23:59:59.999Z';
const colonnes = ['recupere_at', 'livre_at', 'non_livre_at', 'retour_at'];

const reponses = await Promise.all(colonnes.map(col =>
supabaseClient.from('colis').select('*').gte(col, debut).lte(col, fin)
));

const parId = new Map();
for (const { data, error } of reponses) {
// Une colonne qui n'existe pas encore en base — tant que la migration
// _sql-prive/2026-08-colis-par-jour-et-par-livreur.sql n'est pas passée — fait échouer sa
// requête à elle seule. On garde les autres : mieux vaut un tableau partiel et annoncé
// qu'un écran vide. Le message sous le tableau dira ce qui manque.
if (error) { console.error('Vue par jour :', error.message || error); continue; }
(data || []).forEach(c => { if (c && c.id) parId.set(c.id, c); });
}
return Array.from(parId.values());
}

// Combien de colis ne sont comptés dans AUCUNE journée, faute d'horodatage.
//
// Cette question ne peut pas être répondue par les requêtes ci-dessus, et c'est le genre de
// détail qui rend un écran menteur sans que personne s'en aperçoive : on n'y demande que les
// colis dont l'heure tombe dans la journée, donc un colis SANS heure n'y remonte jamais. Le
// compteur que colisDuJourParLivreur() tient de son côté reste donc à zéro quand on ne lui
// donne que les colis d'une journée — il n'est juste que si on lui passe toute la table.
//
// Il faut donc poser la question à part, une fois, pour tous les colis : combien portent un
// statut d'événement sans l'heure correspondante. On ne rapatrie rien, on compte seulement.
async function colisSansHorodatageCompte(){
const total = { recupere: 0, livre: 0, non_livre: 0, retour: 0 };
await Promise.all(Object.keys(total).map(async statut => {
const colonne = HORODATAGE_DU_STATUT[statut];
const { count, error } = await supabaseClient
.from('colis')
.select('id', { count: 'exact', head: true })
.eq('statut', statut)
.is(colonne, null);
// Colonne pas encore créée : on ne sait pas, et on préfère se taire plutôt qu'annoncer zéro.
if (error) { console.error('Vue par jour, colis sans heure :', error.message || error); return; }
total[statut] = count || 0;
}));
return total;
}

// Une cellule à zéro est affichée en gris pâle : sur une ligne de six nombres, l'œil doit
// accrocher ce qui existe, pas ce qui est vide. Même règle que le rapport par livreur.
function jourCell(label, valeur, options){
const o = options || {};
const style = (valeur === 0) ? ' style="color:var(--muted);"' : '';
return `<td data-label="${label}"${style}>${o.fort && valeur !== 0 ? '<strong>' + valeur + '</strong>' : valeur}</td>`;
}

function jourLabelLisible(jour){
if (!jour) return '';
// Midi en temps universel : on est sûr de rester dans la bonne journée quelle que soit
// l'heure de l'appareil qui affiche l'étiquette.
return new Date(jour + 'T12:00:00Z').toLocaleDateString('fr-FR',
{ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

async function renderRapportJour(){
const recap = document.getElementById('rapport-jour-recap');
const box = document.getElementById('rapport-jour-content');
if (!recap || !box) return;

const jour = jourRapportChoisi();
// cltPoserHTML n'écrit que si le contenu a changé : sans cette précaution, le rafraîchissement
// périodique remplacerait le tableau par un tableau identique, ce qui suffit à faire sauter la
// page sous le doigt.
cltPoserHTML(recap, `<div class="empty-state">Calcul en cours…</div>`);

const [colis, sansHeure] = await Promise.all([
colisDuJourDepuisLaBase(jour),
colisSansHorodatageCompte(),
]);
const resultat = colisDuJourParLivreur(colis, livreurs, jour);
// Le compteur tenu par le calcul ne vaut que pour la liste qu'on lui a donnée — ici, une seule
// journée. On lui substitue celui de la base, qui porte sur toute la table. Voir le commentaire
// de colisSansHorodatageCompte().
resultat.sansHorodatage = sansHeure;
const t = resultat.total;

// Les livreurs qui n'ont rien fait ce jour-là sont nommés à part plutôt que d'occuper une
// ligne de zéros chacun : sur une petite journée, dix lignes vides noient les deux qui comptent.
const actifs = resultat.lignes.filter(l => l.recus || l.livres || l.nonLivres || l.retours || l.enCours);
const inactifs = resultat.lignes
.filter(l => !actifs.includes(l))
.map(l => collecteLivreurLabel(l.livreur_id))
.filter(Boolean);

const ligneHTML = (l, nom, gras) => `<tr${gras ? ' style="background:var(--grey-bg);"' : ''}>
<td data-label="Livreur">${gras ? '<strong>' + nom + '</strong>' : nom}</td>
${jourCell('Reçus', l.recus)}
${jourCell('Livrés', l.livres, { fort: true })}
${jourCell('Non livrés', l.nonLivres)}
${jourCell('Retours', l.retours)}
${jourCell('Encore en cours', l.enCours)}
</tr>`;

const couverture = couvertureDuJourTexte(resultat);

cltPoserHTML(recap, !actifs.length
? `<div class="page-sub" style="margin-bottom:10px;">${escapeHTML(jourLabelLisible(jour))}</div>
<div class="empty-state">Aucun colis n'a bougé ce jour-là.</div>
${couverture ? `<div class="page-sub" style="margin-top:10px;">${escapeHTML(couverture)}</div>` : ''}`
: `
<div class="page-sub" style="margin-bottom:12px;">${escapeHTML(jourLabelLisible(jour))} · ${t.recus} reçus, ${t.livres} livrés par ${actifs.length} livreur(s).</div>
<div class="recap-table-wrap">
<table class="recap-table recap-table-cards">
<thead><tr>
<th>Livreur</th><th>Reçus</th><th>Livrés</th><th>Non livrés</th><th>Retours</th><th>Encore en cours</th>
</tr></thead>
<tbody>${actifs.map(l => ligneHTML(l, collecteLivreurLabel(l.livreur_id) || 'Livreur retiré de la liste', false)).join('')}${ligneHTML(t, 'TOTAL', true)}</tbody>
</table>
</div>
<details class="eq-aide"><summary>ℹ️ Comment lire</summary><div class="page-sub" style="margin-top:8px; line-height:1.6;">
<div><strong>Chaque colonne compte ce qui s'est passé CE JOUR-LÀ</strong>, pas les colis enregistrés ce jour-là. Un colis enregistré lundi et livré mercredi est une livraison de mercredi.</div>
<div style="margin-top:4px;"><strong>Reçus</strong> : colis passés dans les mains du livreur ce jour-là. <strong>Livrés</strong>, <strong>Non livrés</strong>, <strong>Retours</strong> : ce qu'il en a fait ce jour-là.</div>
<div style="margin-top:4px;"><strong>Encore en cours</strong> : parmi les colis reçus ce jour-là, ceux dont le sort n'est toujours pas fixé aujourd'hui. Sur la journée d'aujourd'hui, c'est ce qui reste à faire d'ici ce soir.</div>
<div style="margin-top:4px;">Un même colis peut compter dans deux colonnes — reçu le matin, livré l'après-midi. Ce sont deux gestes, et le tableau les compte tous les deux. Les colonnes ne s'additionnent donc pas en un nombre de colis.</div>
<div style="margin-top:4px;">La journée est celle d'Abidjan, où que soit consulté cet écran.</div>
${couverture ? `<div style="margin-top:4px;">${escapeHTML(couverture)}</div>` : ''}
${inactifs.length ? `<div style="margin-top:4px;">Sans aucun colis ce jour-là : ${escapeHTML(inactifs.join(', '))}.</div>` : ''}
</div></details>
`);

// Le détail, sous le tableau : les fiches des colis qui ont bougé ce jour-là. Même journée,
// même liste — plus deux notions de « jour » sur le même écran.
cltPoserHTML(box, !colis.length
? `<div class="empty-state">Aucun colis n'a bougé ce jour-là.</div>`
: `<div class="colis-list">${colis
.slice()
.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
.map(colisMiniHTML).join('')}</div>`);
}

// 05/09/2026 — « Vue par mois » (monthKey, monthLabel, populateMoisSelect, renderRapportMois)
// supprimée : elle comptait sur allColis, tronqué à 500 colis, donc faux au-delà ; l'onglet
// Clients la remplace.

// Les trois fonctions ci-dessous étaient parties avec ce nettoyage alors que le rapport « Par
// livreur » les appelle encore : depuis le 5 septembre, l'onglet restait sur « Calcul en
// cours… ». Rétablies le 16/09/2026 (feuille de route 3.1), sur la lecture par tranches : la
// période choisie est lue dans la base, en entier, jamais depuis les 500 colis en mémoire.
async function perfColisPeriode(){
const debut = document.getElementById('perf-date-debut')?.value || '';
const fin = document.getElementById('perf-date-fin')?.value || '';
try {
return await cltLireTout(() => {
let query = supabaseClient.from('colis').select('*').order('created_at', { ascending: false });
if (debut) query = query.gte('created_at', debut + 'T00:00:00');
if (fin) query = query.lte('created_at', fin + 'T23:59:59');
return query;
});
} catch (error) { console.error('Rapport par livreur :', error); return null; }
}

function perfPeriodeTexte(){
const debut = document.getElementById('perf-date-debut')?.value || '';
const fin = document.getElementById('perf-date-fin')?.value || '';
const jour = (v) => new Date(v + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
if (debut && fin) return debut === fin ? ('Le ' + jour(debut) + ' — colis enregistrés ce jour-là') : ('Du ' + jour(debut) + ' au ' + jour(fin));
if (debut) return 'À partir du ' + jour(debut);
if (fin) return "Jusqu'au " + jour(fin);
return 'Depuis le début';
}

// Une cellule de chiffre qui vaut zéro est affichée en gris pâle : sur une ligne de dix nombres,
// l'œil doit accrocher ce qui existe, pas ce qui est vide.
function perfCell(label, valeur, options){
const o = options || {};
const vide = (valeur === 0 || valeur === '—');
const style = vide ? ' style="color:var(--muted);"' : (o.style ? ' style="' + o.style + '"' : '');
return `<td data-label="${label}"${style}>${o.fort && !vide ? '<strong>' + valeur + '</strong>' : valeur}</td>`;
}

async function renderRapportLivreur(){
const box = document.getElementById('rapport-livreur-content');
if (!box) return;
// Chaque écriture passe par cltPoserHTML : si le contenu est identique au précédent, rien n'est
// réécrit. Sans cette précaution, le rafraîchissement périodique remplaçait le tableau par un
// tableau identique, ce qui suffisait à refermer les lignes dépliées et à faire sauter la page
// sous le doigt. On ne s'occupe pas de la valeur de retour ici : il n'y a rien à faire ensuite.
cltPoserHTML(box, `<div class="empty-state">Calcul en cours…</div>`);

const colis = await perfColisPeriode();
if (colis === null) {
// Un échec réseau ne doit surtout pas ressembler à « personne n'a rien livré ».
cltPoserHTML(box, `<div class="empty-state">Les chiffres n'ont pas pu être chargés. Vérifiez la connexion, puis rechoisissez la période.</div>`);
return;
}

const stats = statistiquesParLivreur(colis, livreurs);
const avecActivite = stats.filter(s => s.total > 0);
if (!avecActivite.length) {
cltPoserHTML(box, `<div class="page-sub" style="margin-bottom:10px;">${escapeHTML(perfPeriodeTexte())}</div>
<div class="empty-state">Aucun colis confié à un livreur sur cette période.</div>`);
return;
}

const totaux = totauxParLivreur(avecActivite);
const medianeMaison = delaiMedianGlobalHeures(colis);

const ligne = (s, nom, gras) => `<tr${gras ? ' style="background:var(--grey-bg);"' : ''}>
<td data-label="Livreur">${gras ? '<strong>' + nom + '</strong>' : nom}</td>
${perfCell('Livrés', s.livres, { fort: true })}
${perfCell('Non livrés', s.nonLivres)}
${perfCell('Retours', s.retours)}
${perfCell('En cours', s.enCours)}
${perfCell('Pas encore pris', s.enAttente)}
${perfCell('Taux de réussite', tauxTexte(s.tauxReussite))}
${perfCell('Du premier coup', tauxTexte(s.tauxPremierCoup))}
${perfCell('Délai habituel', delaiTexte(s.__delai))}
</tr>`;

const corps = avecActivite.map(s => {
s.__delai = s.delaiMedianHeures;
return ligne(s, collecteLivreurLabel(s.livreur_id) || 'Livreur retiré de la liste', false);
}).join('');

totaux.__delai = medianeMaison;

// Les livreurs sans aucun colis sur la période sont nommés à part plutôt que d'être absents :
// une ligne manquante laisse penser à un oubli, une phrase explicite ne laisse aucun doute.
const inactifs = stats.filter(s => s.total === 0)
.map(s => collecteLivreurLabel(s.livreur_id))
.filter(Boolean);

cltPoserHTML(box, `
<div class="page-sub" style="margin-bottom:12px;">${escapeHTML(perfPeriodeTexte())} · ${totaux.total} colis confiés à ${avecActivite.length} livreur(s).</div>
<div class="recap-table-wrap">
<table class="recap-table recap-table-cards">
<thead><tr>
<th>Livreur</th><th>Livrés</th><th>Non livrés</th><th>Retours</th><th>En cours</th><th>Pas encore pris</th>
<th>Taux de réussite</th><th>Du premier coup</th><th>Délai habituel</th>
</tr></thead>
<tbody>${corps}${ligne(totaux, 'Ensemble', true)}</tbody>
</table>
</div>
<details class="eq-aide"><summary>ℹ️ Comment lire</summary><div class="page-sub" style="margin-top:8px; line-height:1.6;">
<div><strong>Taux de réussite</strong> : colis livrés rapportés aux colis dont le sort est fixé (livrés, non livrés, retours). Un colis encore en route n'est compté nulle part — il n'est ni une réussite ni un échec.</div>
<div style="margin-top:4px;"><strong>Du premier coup</strong> : part des colis livrés sans aucun passage infructueux enregistré.</div>
<div style="margin-top:4px;"><strong>Délai habituel</strong> : temps écoulé entre l'enregistrement du colis et sa remise, pour le colis du milieu (la moitié plus vite, la moitié moins vite). Ce délai inclut l'attente au dépôt avant qu'un livreur ne prenne le colis — ce n'est donc pas à lui seul un jugement sur le livreur.</div>
<div style="margin-top:4px;">${escapeHTML(couvertureMesureTexte(avecActivite))}</div>
${inactifs.length ? `<div style="margin-top:4px;">Sans aucun colis sur cette période : ${inactifs.join(', ')}.</div>` : ''}
</div></details>
`);
}

// Boutons de période. Ils remplissent les deux dates puis relancent le calcul, exactement comme
// si l'utilisateur avait choisi les dates à la main — un seul chemin de code à vérifier.
function perfSetPeriode(joursEnArriere){
const debut = document.getElementById('perf-date-debut');
const fin = document.getElementById('perf-date-fin');
if (!debut || !fin) return;
if (joursEnArriere === null) {
debut.value = '';
fin.value = '';
} else {
const d = new Date();
fin.value = todayLocalISODate();
d.setDate(d.getDate() - (joursEnArriere - 1));
debut.value = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}
const jour = document.getElementById('perf-jour');
if (jour) jour.value = '';
renderRapportLivreur();
}

// Si une période (début et/ou fin) est choisie, on interroge directement la base de données pour
// cette période au lieu de filtrer uniquement les colis déjà chargés en mémoire (`allColis`) :
// tant que l'historique complet n'a pas été rapatrié via "Charger plus" (voir COLIS_PAGE_SIZE),
// `allColis` ne couvre pas forcément d'anciennes périodes. Sans période choisie, on continue de
// filtrer `allColis` en mémoire (instantané, pas d'aller-retour réseau) comme avant.
// 16/09/2026 (feuille de route 3.1) : la comptabilité lit TOUJOURS la base, par tranches, pour
// la période choisie — plus jamais les 500 colis en mémoire, qui ne couvrent qu'une page. Sans
// période, c'est tout l'historique qui est lu ; c'est long, mais c'est juste.
function comptaPeriodeTexte(){
const debut = document.getElementById('compta-date-debut')?.value || '';
const fin = document.getElementById('compta-date-fin')?.value || '';
const jour = (v) => new Date(v + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
if (debut && fin) return debut === fin ? 'Le ' + jour(debut) : 'Du ' + jour(debut) + ' au ' + jour(fin);
if (debut) return 'À partir du ' + jour(debut);
if (fin) return "Jusqu'au " + jour(fin);
return 'Depuis le début — tout l\'historique est compté';
}

async function comptaFiltered(){
const fournisseurId = document.getElementById('compta-fournisseur')?.value || '';
const debut = document.getElementById('compta-date-debut')?.value || '';
const fin = document.getElementById('compta-date-fin')?.value || '';
try {
return await cltLireTout(() => {
let query = supabaseClient.from('colis').select('*').order('created_at', { ascending: false });
if (fournisseurId) query = query.eq('fournisseur_id', fournisseurId);
if (debut) query = query.gte('created_at', debut + 'T00:00:00');
if (fin) query = query.lte('created_at', fin + 'T23:59:59');
return query;
});
} catch (error) { console.error('Comptabilité :', error); return []; }
}

// Le point du soir avec une vendeuse ne porte que sur le montant « article » qui lui revient :
// la livraison est gérée et encaissée par la structure elle-même, jamais par la vendeuse.
//
// montantArticleColis() vivait ici, en double de config.js, et c'est ainsi que les deux écrans
// se sont mis à dire deux choses différentes avec les mêmes mots : « Montant total » voulait
// dire article seul côté équipe et article + livraison côté cliente. La définition est
// désormais unique, dans config.js, avec tout le reste du calcul d'argent. Ne pas la recopier.
//
// Ce qui reste ici, ce sont les deux lectures propres à l'onglet Comptabilité.

// Ce que CLT doit encore à la vendeuse sur ce colis (article encaissé, pas encore reversé).
// Attention au nom d'avant, « resteArticleAPercevoir » : il disait « à percevoir » alors qu'il
// s'agit d'une dette envers elle, pas d'une créance. Le mot comptait plus qu'il n'y paraît.
/* resteArticleADevoir() était un second nom pour montantArticleADevoir() — jamais appelé.
   Retiré le 17/09/2026, même raison. */
function articlePaiementLabel(c) {
if (!c) return '—';
if (c.statut !== 'livre') return 'Pas encore encaissé';
if (c.article_non_encaisse) return 'Article soldé';
return c.reverse_au_fournisseur_at ? 'Encaissé et reversé' : 'Encaissé, à reverser';
}

/* LA DETTE NE SE RANGE PAS DANS UNE PÉRIODE — 18 septembre 2026, au soir
   ==========================================================================================
   Celtis : « pour le premier tableau il me semble qu'il n'affiche pas les données correctes. »
   Il avait raison, et voici pourquoi.

   Le filtre de dates de cet onglet s'ouvre sur AUJOURD'HUI et porte sur `created_at`. Le
   récapitulatif par vendeuse ne montrait donc que les colis CRÉÉS aujourd'hui — et sa colonne
   « À reverser » n'annonçait que la dette née aujourd'hui. Or ce que CLT doit à une cliente ne
   se range pas dans une journée : c'est l'argent de tous ses colis livrés et pas encore remis,
   depuis toujours. Un colis créé lundi, livré mardi, se payait mercredi : il n'apparaissait
   dans aucune des trois journées.

   Payer d'après ce tableau, c'était donc payer moins que ce qu'on doit — et le relevé envoyé à
   la même cliente le même soir, lui, annonçait la vraie somme. Deux chiffres pour la même dette.

   CE QUI CHANGE. La colonne « À reverser » est lue À PART, sur TOUTES les dates, exactement
   comme le fait le relevé de la cliente et le bloc du point du jour juste au-dessus : mêmes
   colis, même addition de la maison (montantNetADevoir). Les autres colonnes — colis, livrés,
   articles — restent celles de la PÉRIODE choisie : ce sont des mesures d'activité, et là la
   période a un sens. Et une cliente à qui l'on doit de l'argent apparaît dans le tableau même
   si elle n'a rien confié pendant la période : sinon la dette resterait invisible le jour où
   l'on veut justement la solder.
   ========================================================================================== */
async function comptaDettes(){
  try {
    return await cltLireTout(() => supabaseClient.from('colis').select('*')
      .eq('statut', 'livre').is('reverse_au_fournisseur_at', null).order('id'));
  } catch (error) { console.error('Comptabilité — dettes :', error); return []; }
}

async function renderCompta(){
if (window.CLTPointDuJour) { CLTPointDuJour.init(); CLTPointDuJour.rafraichir(); }
// La chaîne de l'argent (10.1) : relue à chaque fois que les finances se redessinent — donc après
// chaque remise de caisse et chaque reversement.
if (window.CLTChaineEcran) { CLTChaineEcran.init(); CLTChaineEcran.rafraichir(); }
const summary = document.getElementById('compta-summary');
const recapBox = document.getElementById('compta-recap');
const detail = document.getElementById('compta-detail');
if (!summary || !recapBox || !detail) return;

const [rows, colisDus] = await Promise.all([comptaFiltered(), comptaDettes()]);
// La dette par cliente, toutes dates : le même calcul que son relevé du soir.
const detteParCliente = {};
colisDus.forEach((c) => {
  const k = c.fournisseur_id || 'inconnu';
  (detteParCliente[k] = detteParCliente[k] || []).push(c);
});
const detteDe = (id) => (detteParCliente[id] || []).reduce((s2, c) => s2 + (montantNetADevoir(c) || 0), 0);
const detteTotale = Object.keys(detteParCliente).reduce((s2, k) => s2 + detteDe(k), 0);
const nbColisDus = (id) => (detteParCliente[id] || []).length;
// La période comptée, en toutes lettres : personne ne doit prendre un jour pour un mois, ni un
// mois pour tout l'historique. (16/09/2026)
const periodeTexte = comptaPeriodeTexte();
if (!rows.length && !colisDus.length) {
cltPoserHTML(summary, `<div class="page-sub">${escapeHTML(periodeTexte)}</div>`);
cltPoserHTML(recapBox, `<div class="empty-state">Aucun colis sur cette période, et rien à reverser.</div>`);
cltPoserHTML(detail, '');
renderCaisseLivreur([]);
return;
}

const fournisseurId = document.getElementById('compta-fournisseur')?.value || '';
const t = totauxArgent(rows);
// Trois chiffres, trois natures. On les nomme en toutes lettres plutôt que « montant total » /
// « montant livré », qui ne disaient ni de quelle poche il s'agissait ni dans quel état.
//
// « À reverser aux clientes » lit netADevoir depuis le 1er septembre 2026, et non plus
// articleADevoir. Les deux ne diffèrent que sur les expéditions — mais c'est justement là que
// ce tableau servait à préparer des paiements : il annonçait le brut, frais non retenus, donc
// plus d'argent que le relevé envoyé à la même cliente le même soir n'en promettait. Deux
// chiffres pour la même dette, et c'est le plus élevé qui servait à payer.
cltPoserHTML(summary, `
<div class="page-sub"><strong>${escapeHTML(periodeTexte)}</strong></div>
<div class="page-sub">
${t.nb} colis · ${t.nbLivres} livré(s) ·
Articles enregistrés : <strong>${formatMontant(t.articleEnregistre) || '0 FCFA'}</strong> ·
Articles encaissés : <strong>${formatMontant(t.articleEncaisse) || '0 FCFA'}</strong> ·
${(t.fraisExpeditionADevoir + t.fraisCourseADevoir) ? `Retenues (gare + course) : <strong style="color:${COULEUR_NEGATIF_CLT};">−${formatMontant(t.fraisExpeditionADevoir + t.fraisCourseADevoir)}</strong> · ` : ''}À reverser aux clientes, <strong>toutes dates</strong> : <strong style="color:${detteTotale > 0 ? '#c0392b' : '#1a7d3c'};">${formatMontant(detteTotale) || '0 FCFA'}</strong>
${t.manquantALaLivraison > 0 ? ` · <strong style="color:#c0392b;">Non encaissé à la livraison : ${formatMontant(t.manquantALaLivraison)}</strong>` : ''}
</div>
`);

// Récap par vendeuse — c'est le point du soir. On sépare ce qui a été enregistré (activité) de
// ce qui a été encaissé (argent) : additionner les deux dans une seule colonne « Montant »
// donnait un chiffre avec lequel on ne pouvait payer personne.
const parFournisseur = {};
rows.forEach(c => {
const key = c.fournisseur_id || 'inconnu';
if (!parFournisseur[key]) parFournisseur[key] = [];
parFournisseur[key].push(c);
});
/* Une cliente à qui l'on doit de l'argent est dans le tableau MÊME si elle n'a rien confié
   pendant la période : c'est justement le jour où l'on veut la payer qu'elle ne doit pas
   disparaître. Ses colonnes d'activité sont alors à zéro, ce qui est vrai. */
const idsAvecDette = Object.keys(detteParCliente).filter((id) => detteDe(id) !== 0);
const tousIds = [...new Set(Object.keys(parFournisseur).concat(idsAvecDette))];
const recapRows = tousIds
.map(id => ({ id, t: totauxArgent(parFournisseur[id] || []), du: detteDe(id), nbDus: nbColisDus(id) }))
.sort((a, b) => Math.abs(b.du) - Math.abs(a.du) || b.t.nb - a.t.nb);
cltPoserHTML(recapBox, `
<div class="page-sub" style="margin-bottom:6px;">Colis, livrés et articles portent sur la période choisie. <strong>« À reverser » porte sur toutes les dates</strong> : une dette ne se range pas dans une journée, et c'est le chiffre avec lequel on paie.</div>
<div class="recap-table-wrap">
<table class="recap-table recap-table-cards">
<thead><tr><th>Client</th><th>Colis</th><th>Livrés</th><th>Articles enregistrés</th><th>Articles encaissés</th><th title="Avances de gare + frais de course (expéditions et articles soldés), encore à retenir">Retenues</th><th title="Ce que CLT doit encore à cette cliente sur TOUS ses colis livrés et pas encore remis, quelle que soit la période affichée. Une dette ne se range pas dans une journée.">À reverser — toutes dates</th></tr></thead>
<tbody>
${recapRows.map(r => `
<tr>
<td data-label="Client">${fournisseurLabel(r.id)}</td>
<td data-label="Colis">${r.t.nb}</td>
<td data-label="Livrés">${r.t.nbLivres}</td>
<td data-label="Articles enregistrés">${formatMontant(r.t.articleEnregistre) || '0 FCFA'}</td>
<td data-label="Articles encaissés">${formatMontant(r.t.articleEncaisse) || '0 FCFA'}</td>
<td data-label="Retenues" style="color:${COULEUR_NEGATIF_CLT}; font-weight:700;">${(r.t.fraisExpeditionADevoir + r.t.fraisCourseADevoir) ? '−' + formatMontant(r.t.fraisExpeditionADevoir + r.t.fraisCourseADevoir) + `<div class="meta" style="font-size:11px;">${r.t.fraisExpeditionADevoir ? 'gare ' + formatMontant(r.t.fraisExpeditionADevoir) : ''}${r.t.fraisExpeditionADevoir && r.t.fraisCourseADevoir ? ' · ' : ''}${r.t.fraisCourseADevoir ? 'course ' + formatMontant(r.t.fraisCourseADevoir) : ''}</div>` : '—'}</td>
<td data-label="À reverser — toutes dates" style="color:${r.du > 0 ? '#c0392b' : '#1a7d3c'}; font-weight:700;">${formatMontant(r.du) || '0 FCFA'}${r.nbDus ? `<div class="meta" style="font-size:11px;">${r.nbDus} colis</div>` : ''}</td>
</tr>
`).join('')}
</tbody>
${piedTotalHTML([
{ texte: 'TOTAL' },
{ texte: t.nb, label: 'Colis' },
{ texte: t.nbLivres, label: 'Livrés' },
{ texte: formatMontant(t.articleEnregistre) || '0 FCFA', label: 'Articles enregistrés' },
{ texte: formatMontant(t.articleEncaisse) || '0 FCFA', label: 'Articles encaissés' },
{ texte: (t.fraisExpeditionADevoir + t.fraisCourseADevoir) ? '−' + formatMontant(t.fraisExpeditionADevoir + t.fraisCourseADevoir) : '—', couleur: COULEUR_NEGATIF_CLT, label: 'Retenues' },
{ texte: formatMontant(detteTotale) || '0 FCFA', couleur: detteTotale > 0 ? '#c0392b' : '#1a7d3c', label: 'À reverser — toutes dates' },
])}
</table>
</div>
`);

// Détail colis par colis, éditable en direct — c'est le point du soir avec LA vendeuse. Pour ne
// jamais mélanger plusieurs vendeuses dans une même séance d'édition, ce détail éditable
// n'apparaît que lorsqu'une vendeuse précise est choisie dans le filtre "Client" ci-dessus ; sur
// "Tous les clients", seul le récapitulatif global (par vendeuse) au-dessus reste visible. Le
// montant de livraison n'est ni affiché ni compté ici : il ne la regarde pas, c'est la recette
// de CLT. Il reste géré côté livreur et dans "Tous les colis".
//
// La case a changé de sens le 25 août 2026. Avant : « Article payé », à cocher pour que l'argent
// compte — personne ne la cochait, et le relevé de chaque vendeuse affichait donc zéro.
// Maintenant : « Argent non encaissé », à cocher pour signaler l'EXCEPTION. Par défaut, un colis
// livré compte comme encaissé, ce qui est le cas neuf fois sur dix.
if (!fournisseurId) {
cltPoserHTML(detail, `<div class="empty-state">Choisissez une vendeuse dans le filtre "Client" ci-dessus pour afficher et modifier son récapitulatif détaillé.</div>`);
} else {
const tDetail = totauxArgent(rows);
// LE point le plus sensible de toute l'application : ce tableau contient les montants d'article,
// les cases « argent non encaissé » et les observations, tapés à la main pendant le point du soir
// avec la vendeuse. Le réécrire à l'identique toutes les 25 secondes effaçait ce qui était en
// train d'être saisi. On ne le redessine désormais que si les données ont réellement changé.
// (25/08/2026)
if (cltPoserHTML(detail, `
<div class="recap-table-wrap">
<table class="recap-table recap-table-cards">
<thead><tr><th>Colis</th><th>Client</th><th>Statut</th><th>Article</th><th>Encaissé</th><th>Argent</th><th>Observation</th><th>Date</th><th></th></tr></thead>
<tbody>
${rows.map(c => `
<tr data-id="${c.id}">
<td data-label="Colis"><div class="recap-colis-ou">${colisDestinationHTML(c)}</div>${colisDescriptionTexte(c) ? `<div class="recap-colis-quoi">📦 ${escapeHTML(colisDescriptionTexte(c))}</div>` : ''}</td>
<td data-label="Client">${fournisseurLabel(c.fournisseur_id)}</td>
<td data-label="Statut">${libelleStatut(c.statut, c)}</td>
<td data-label="Article"><input type="number" class="compta-edit-article" min="0" step="any" value="${c.montant_article !== null && c.montant_article !== undefined ? c.montant_article : ''}"></td>
<td data-label="Encaissé" class="compta-row-encaisse">${formatMontant(montantArticleEncaisse(c)) || '0 FCFA'}</td>
<td data-label="Argent">
<div class="recap-row-checks">
<label title="À cocher si le destinataire a DÉJÀ payé l'article chez le fournisseur. Le livreur ne l'encaisse pas à la porte, et rien n'est dû au fournisseur pour cet article. Ne dit rien de la livraison."><input type="checkbox" class="compta-edit-non-encaisse" ${c.article_non_encaisse ? 'checked' : ''}> Article soldé</label>
<div class="recap-row-etat">${articlePaiementLabel(c)}</div>
</div>
</td>
<td data-label="Observation"><textarea class="compta-edit-observation" placeholder="Observation...">${c.observation ? escapeHTML(c.observation) : ''}</textarea></td>
<td data-label="Date">${formatDate(c.created_at)}</td>
<td><button type="button" class="btn btn-sm compta-save-row">Enregistrer</button> <button type="button" class="btn btn-outline btn-sm" data-ouvrir-colis="${c.id}" title="Ouvrir la fiche complète : statut, livreur, adresse, montants, tout">✏️ Tout modifier</button></td>
</tr>
`).join('')}
</tbody>
${piedTotalHTML([
{ texte: 'TOTAL' },
{ texte: '' },
{ texte: tDetail.nbLivres + ' livré(s)', label: 'Statut' },
{ texte: formatMontant(tDetail.articleEnregistre) || '0 FCFA', label: 'Article' },
{ texte: formatMontant(tDetail.articleEncaisse) || '0 FCFA', label: 'Encaissé' },
{ texte: 'À reverser : ' + (formatMontant(tDetail.netADevoir) || '0 FCFA'), couleur: tDetail.netADevoir > 0 ? '#c0392b' : '#1a7d3c' },
{ texte: '' },
{ texte: '' },
{ texte: '' },
])}
</table>
</div>
`)) {
detail.querySelectorAll('.compta-save-row').forEach(btn => {
btn.addEventListener('click', async () => {
const tr = btn.closest('tr');
const id = tr.dataset.id;
const artRaw = tr.querySelector('.compta-edit-article').value.trim();
if (!isValidMontant(artRaw === '' ? null : artRaw)) {
cltToast("Le montant doit être un nombre positif.", { type: 'warning' });
return;
}
const montant_article = artRaw === '' ? null : Number(artRaw);
const article_non_encaisse = tr.querySelector('.compta-edit-non-encaisse').checked;
const observation = tr.querySelector('.compta-edit-observation').value.trim() || null;
const existing = allColis.find(c => c.id === id);
const montant_livraison = existing ? existing.montant_livraison : null;
const montant = (montant_article !== null || montant_livraison !== null)
? (Number(montant_article) || 0) + (Number(montant_livraison) || 0)
: (existing ? existing.montant : 0);
btn.disabled = true; btn.textContent = '...';
const { error } = await supabaseClient.from('colis').update({ montant, montant_article, article_non_encaisse, observation }).eq('id', id);
btn.disabled = false; btn.textContent = 'Enregistrer';
if (error) { cltToast(friendlyErrorMessage(error.message), { type: 'error' }); return; }
const idx = allColis.findIndex(c => c.id === id);
if (idx !== -1) Object.assign(allColis[idx], { montant, montant_article, article_non_encaisse, observation });
renderCompta();
});
});
}
}

renderCaisseLivreur(rows);
}

// ---------- Réconciliation de caisse par livreur ----------
// Calcule par livreur ce qu'il a réellement en main sur la période et ce qu'il reste à remettre
// à l'entreprise. Ici — et ici seulement — les deux poches s'additionnent :
// le livreur porte physiquement l'argent de l'article ET les frais de livraison. C'est le seul
// endroit de l'application où ce total a un sens.
//
// Correction du 25 août 2026 : le total comptait montantTotalColis(), c'est-à-dire le montant
// écrit sur le colis, même quand le colis avait été remis sans que l'argent rentre. On lui
// réclamait alors une somme qu'il n'avait jamais eue. On compte désormais ce qui est encaissé.
//
// Dégradation gracieuse : si la colonne encaissement_remis n'existe pas encore (migration SQL
// non lancée), tout est considéré « à remettre » et le bouton informe qu'il faut lancer la migration.
//
// Correction du 25 août 2026 (avances de gare) : ce tableau ne regardait que les colis LIVRÉS.
// Or le livreur paie la gare le matin, sur un colis qui n'arrivera que le lendemain ou plus tard.
// Entre les deux, l'argent était sorti de sa poche sans qu'aucun écran de l'équipe ne le sache :
// son téléphone affichait 11 000, ce tableau lui en réclamait 14 000. On compte désormais l'avance
// dès le jour où elle est payée, exactement comme son téléphone.
//
// Deux ensembles DISJOINTS sont donc constitués par livreur :
//   • idsAremettre       — colis livrés dont l'argent n'est pas encore remis ;
//   • idsFraisARembourser — colis PAS ENCORE livrés portant une avance non remboursée.
// Le second ne doit jamais être marqué « remis » : le jour de la livraison, son argent sera
// réclamé en entier. Seule la date de remboursement de l'avance y est posée, pour que l'avance
// ne soit pas déduite une seconde fois.
