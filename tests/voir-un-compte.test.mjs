/* « 👁 VOIR SON ÉCRAN » — L'ADMINISTRATEUR REGARDE UN COMPTE, EN LECTURE SEULE (21/09/2026)
   Celtis : « que l'administrateur puisse parcourir tous les comptes et voir exactement ce qu'ils voient ».
   Ce banc tient la règle (qui regarde, qui se regarde, quel tri, quelles opérations passent) et vérifie
   que les pages l'appliquent en un seul endroit.
   Lancer à la main :  node tests/voir-un-compte.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 300) : '')); } }

const w = {}; vm.runInNewContext(lire('app/voir-un-compte.js'), { window: w, String, decodeURIComponent, encodeURIComponent });
const R = w.CLTVoirUnCompte;
const ADMIN = { id: '11111111-1111-4111-8111-111111111111', role: 'admin', status: 'valide' };
const LIVREUR = { id: '22222222-2222-4222-8222-222222222222', role: 'livreur', status: 'valide', full_name: 'Hamed K.' };
const CLIENTE = { id: '33333333-3333-4333-8333-333333333333', role: 'fournisseur', status: 'valide', full_name: 'Awa', company_name: 'Lash with Reine' };

console.log('\n1. Qui a le droit de regarder');
verifier('l\'administrateur au compte valide : oui', R.peutRegarder(ADMIN) === true);
verifier('l\'équipe, un livreur, une cliente, personne : non', [{ role: 'equipe', status: 'valide' }, LIVREUR, CLIENTE, null, undefined, {}].every((p) => R.peutRegarder(p) === false));
verifier('un administrateur suspendu ou en attente : non', R.peutRegarder({ role: 'admin', status: 'suspendu' }) === false && R.peutRegarder({ role: 'admin', status: 'en_attente' }) === false);

console.log('\n2. Quel compte se regarde');
verifier('un livreur → son écran de livreur', JSON.stringify(R.peutEtreRegarde(LIVREUR, ADMIN)) === '{"ok":true,"page":"livreur.html"}');
verifier('une cliente → son écran de cliente', R.peutEtreRegarde(CLIENTE, ADMIN).page === 'fournisseur.html');
verifier('l\'équipe, un autre administrateur, un coursier Express : non, et on dit pourquoi', ['equipe', 'admin', 'coursier_express', 'client_express'].every((r) => { const p = R.peutEtreRegarde({ id: LIVREUR.id, role: r }, ADMIN); return p.ok === false && /livreur ou d'une cliente/.test(p.pourquoi); }));
verifier('son propre compte : non', R.peutEtreRegarde(Object.assign({}, LIVREUR, { id: ADMIN.id }), ADMIN).ok === false);
verifier('un compte introuvable ou sans identifiant propre : non', R.peutEtreRegarde(null, ADMIN).ok === false && R.peutEtreRegarde({ id: 'abc', role: 'livreur' }, ADMIN).ok === false);
verifier('demandé par quelqu\'un d\'autre que l\'administrateur : non, quel que soit le compte', R.peutEtreRegarde(LIVREUR, { role: 'equipe', status: 'valide' }).ok === false && R.lien(LIVREUR, CLIENTE) === '');
verifier('le lien porte la page et l\'identifiant, rien d\'autre', R.lien(LIVREUR, ADMIN) === 'livreur.html?voir=' + LIVREUR.id && R.lien(CLIENTE, ADMIN) === 'fournisseur.html?voir=' + CLIENTE.id);

console.log('\n3. Lire la demande dans l\'adresse');
verifier('« ?voir=<identifiant> » est lu, où qu\'il soit dans l\'adresse', R.lireDemande('?voir=' + LIVREUR.id) === LIVREUR.id && R.lireDemande('?colis=9&voir=' + LIVREUR.id + '&x=1') === LIVREUR.id);
verifier('tout ce qui n\'est pas un identifiant est ignoré (texte, script, vide, adresse cassée)', ['?voir=', '?voir=hamed', '?voir=<script>', '?voir=%E0%A4%A', '', '?revoir=' + LIVREUR.id.slice(1)].every((q) => R.lireDemande(q) === null));
verifier('un livreur ne se regarde pas sur l\'écran cliente, et inversement', R.bonnePage(LIVREUR, '/app/livreur.html') && !R.bonnePage(LIVREUR, '/app/fournisseur.html') && R.bonnePage(CLIENTE, 'fournisseur.html?voir=x') && !R.bonnePage(CLIENTE, 'livreur.html'));

console.log('\n4. Le tri des colis : celui que la base applique à la personne');
verifier('livreur : ses livraisons, ses collectes, les retours qu\'il a en main', JSON.stringify(R.filtreDesColis(LIVREUR)) === JSON.stringify({ type: 'or', valeur: `livreur_id.eq.${LIVREUR.id},livreur_collecte_id.eq.${LIVREUR.id},retour_detenteur_livreur_id.eq.${LIVREUR.id}` }));
verifier('cliente : ses colis', JSON.stringify(R.filtreDesColis(CLIENTE)) === JSON.stringify({ type: 'eq', colonne: 'fournisseur_id', valeur: CLIENTE.id }));
verifier('tout autre compte : aucun tri fabriqué', R.filtreDesColis({ id: LIVREUR.id, role: 'equipe' }) === null && R.filtreDesColis(null) === null);

verifier('cliente : son relevé, SES reversements, ses demandes — jamais ceux des autres clientes', ['reversements_clientes', 'releve_fournisseur', 'historique_reversements_fournisseur', 'demandes_de_passage', 'reclamations_clientes', 'programmations_collecte'].every((t) => JSON.stringify(R.filtreDeLaTable(t, CLIENTE)) === JSON.stringify({ type: 'eq', colonne: 'fournisseur_id', valeur: CLIENTE.id })));
verifier('livreur : ses remises, ses annonces, sa tournée, ses signalements', ['remises_caisse', 'annonces_remise', 'programmations_collecte', 'livreur_positions', 'reclamations_clientes'].every((t) => JSON.stringify(R.filtreDeLaTable(t, LIVREUR)) === JSON.stringify({ type: 'eq', colonne: 'livreur_id', valeur: LIVREUR.id })));
verifier('une table sans « à qui c\'est » (les profils, le journal d\'un retour) n\'est pas touchée', R.filtreDeLaTable('profiles', CLIENTE) === null && R.filtreDeLaTable('retours_mouvements', LIVREUR) === null && R.filtreDeLaTable('reversements_clientes', LIVREUR) === null);

console.log('\n5. Lecture seule : ce qui passe, ce qui est refusé');
verifier('lire : oui', R.sortDeLOperation('select') === 'laisser');
verifier('ajouter, modifier, remplacer, supprimer : refusé', ['insert', 'update', 'upsert', 'delete'].every((g) => R.sortDeLOperation(g) === 'refuser'));
verifier('fonction, fichier, et tout genre inconnu : refusé d\'office', ['fonction', 'fichier', 'presence', 'nimportequoi', undefined].every((g) => R.sortDeLOperation(g) === 'refuser'));
verifier('les fonctions de la base qui ÉCRIVENT sont refusées, et toute fonction inconnue aussi', ['confirmer_recuperation', 'annoncer_ma_remise', 'cliente_repond_au_retour', 'une_fonction_future'].every((n) => R.sortDeLOperation('rpc', n) === 'refuser'));
verifier('les fonctions qui écrivent restent refusées, quel que soit le compte regardé', ['confirmer_recuperation', 'annoncer_ma_remise'].every((n) => R.sortDeLOperation('rpc', n, LIVREUR) === 'refuser') && R.sortDeLOperation('rpc', 'cliente_repond_au_retour', CLIENTE) === 'refuser');

console.log('\n5 bis. Sans limites : les lectures « pour celui qui est connecté » répondent pour la personne REGARDÉE');
verifier('les primes du livreur passent par la fonction réservée à l\'administrateur, avec SON identifiant', JSON.stringify(R.lectureDeLaBase('primes_en_cours', null, LIVREUR)) === JSON.stringify({ nom: 'primes_en_cours_de', args: { p_livreur: LIVREUR.id } }) && R.lectureDeLaBase('primes_en_cours', { p_periode: '2026-10-01' }, LIVREUR).args.p_periode === '2026-10-01');
verifier('son annonce de remise : la fonction d\'origine, mais TOUJOURS pour lui — même si l\'écran passait un autre identifiant', JSON.stringify(R.lectureDeLaBase('annonce_remise_en_cours', { p_livreur_id: ADMIN.id }, LIVREUR)) === JSON.stringify({ nom: 'annonce_remise_en_cours', args: { p_livreur_id: LIVREUR.id } }));
verifier('« Mes boutiques » de la propriétaire : la fonction réservée à l\'administrateur', JSON.stringify(R.lectureDeLaBase('mes_boutiques', null, CLIENTE)) === JSON.stringify({ nom: 'mes_boutiques_de', args: { p_superviseur: CLIENTE.id } }));
verifier('donc : détour pour le bon rôle, « rien » pour l\'autre (les primes d\'une cliente), refus pour tout le reste', R.sortDeLOperation('rpc', 'primes_en_cours', LIVREUR) === 'detour' && R.sortDeLOperation('rpc', 'mes_boutiques', CLIENTE) === 'detour' && R.sortDeLOperation('rpc', 'annonce_remise_en_cours', LIVREUR) === 'detour' && R.sortDeLOperation('rpc', 'primes_en_cours', CLIENTE) === 'vide' && R.sortDeLOperation('rpc', 'mes_boutiques', LIVREUR) === 'vide' && R.sortDeLOperation('rpc', 'primes_en_cours_de', LIVREUR) === 'refuser');
const B1 = '44444444-4444-4444-8444-444444444444', B2 = '55555555-5555-4555-8555-555555555555';
const PROPRIO = Object.assign({}, CLIENTE, { boutiques: [B1, { id: B2 }, B1, CLIENTE.id, 'pas-un-id', null] });
verifier('une propriétaire : ses colis ET ceux de ses boutiques (sans doublon, sans elle-même, sans rien de faux)', JSON.stringify(R.filtreDeLaTable('colis', PROPRIO)) === JSON.stringify({ type: 'in', colonne: 'fournisseur_id', valeurs: [CLIENTE.id, B1, B2] }));
verifier('mais son relevé et ses reversements restent les SIENS : la base ne lui ouvre que les colis de ses boutiques', JSON.stringify(R.filtreDeLaTable('reversements_clientes', PROPRIO)) === JSON.stringify({ type: 'eq', colonne: 'fournisseur_id', valeur: CLIENTE.id }) && R.filtreDeLaTable('releve_fournisseur', PROPRIO).type === 'eq');
verifier('une cliente sans boutique : inchangé', R.filtreDeLaTable('colis', CLIENTE).type === 'eq' && R.boutiquesDe(CLIENTE).length === 0);
verifier('le message dit ce qui s\'est passé et comment agir', /lecture seule/.test(R.MESSAGE_LECTURE_SEULE) && /rien n'a été modifié/.test(R.MESSAGE_LECTURE_SEULE) && /« ✏️ Modifier »/.test(R.MESSAGE_LECTURE_SEULE));
verifier('le bandeau nomme la personne (la boutique d\'abord) et son rôle en clair', R.bandeau(CLIENTE).titre === 'Lash with Reine (cliente)' && R.bandeau(LIVREUR).titre === 'Hamed K. (livreur)' && /Vous regardez son écran — lecture seule/.test(R.bandeau(LIVREUR).sousTitre));

console.log('\n5 ter. Le mode « ✏️ Modifier » : voulu, confirmé, tracé — et ce qui reste fermé');
const M = 'modification';
verifier('sans mode, ou avec un mode inconnu : lecture seule', ['insert', 'update', 'upsert', 'delete'].every((g) => R.sortDeLOperation(g, 'colis', LIVREUR) === 'refuser' && R.sortDeLOperation(g, 'colis', LIVREUR, 'nimporte') === 'refuser'));
verifier('en modification : les gestes de l\'écran passent (colis, tournée, réclamations, fichiers)', ['insert', 'update', 'upsert', 'delete'].every((g) => R.sortDeLOperation(g, 'colis', LIVREUR, M) === 'laisser') && R.sortDeLOperation('update', 'programmations_collecte', LIVREUR, M) === 'laisser' && R.sortDeLOperation('insert', 'reclamations_clientes', CLIENTE, M) === 'laisser' && R.sortDeLOperation('fichier', 'colis-photos', LIVREUR, M) === 'laisser');
verifier('la FICHE du compte reste fermée, même en modification : le téléphone et le mot de passe seraient ceux de l\'administrateur', ['insert', 'update', 'upsert', 'delete'].every((g) => R.sortDeLOperation(g, 'profiles', LIVREUR, M) === 'refuser-fiche') && R.sortDeLOperation('identifiants', null, LIVREUR, M) === 'refuser-fiche' && /Équipe › Comptes/.test(R.messageDuRefus('refuser-fiche', M)));
verifier('LA PAROLE DE LA PERSONNE n\'est jamais signée à sa place : « bien reçu », « j\'ai pris 3 colis », « je remets 11 500 F »', R.PAROLE_DE_LA_PERSONNE.length === 3 && R.PAROLE_DE_LA_PERSONNE.every((n) => R.sortDeLOperation('rpc', n, LIVREUR, M) === 'refuser-parole') && /déclaration de la personne/.test(R.messageDuRefus('refuser-parole', M)) && /écran Équipe/.test(R.messageDuRefus('refuser-parole', M)));
verifier('les fonctions du serveur, et toute fonction de la base inconnue : fermées dans les deux modes', R.sortDeLOperation('fonction', 'admin-modifier-compte', LIVREUR, M) === 'refuser' && R.sortDeLOperation('rpc', 'une_fonction_future', LIVREUR, M) === 'refuser' && /n'est pas ouvert depuis l'écran regardé/.test(R.messageDuRefus('refuser', M)));
verifier('les lectures ne changent pas avec le mode', R.sortDeLOperation('rpc', 'primes_en_cours', LIVREUR, M) === 'detour' && R.sortDeLOperation('select', 'colis', LIVREUR, M) === 'laisser');
verifier('le bandeau de modification dit que c\'est fait SOUS SON NOM, et propose de revenir en lecture seule', R.bandeau(LIVREUR, M).mode === M && /Vous MODIFIEZ son compte — chaque geste est fait sous votre nom/.test(R.bandeau(LIVREUR, M).sousTitre) && R.bandeau(LIVREUR, M).bascule === '👁 Lecture seule' && R.bandeau(LIVREUR).bascule === '✏️ Modifier' && R.bandeau(LIVREUR, M).titre === 'Hamed K. (livreur)');
verifier('la confirmation prévient : enregistré pour de bon, sous son nom, et la personne le verra', /réellement enregistrés/.test(R.CONFIRMER_LA_MODIFICATION.detail) && /sous votre nom/.test(R.CONFIRMER_LA_MODIFICATION.detail) && /verra/.test(R.CONFIRMER_LA_MODIFICATION.detail));

console.log('\n6. Les pages appliquent la règle, en un seul endroit');
const config = lire('app/config.js'), commun = lire('app/clt-common.js'), livreur = lire('app/livreur.html'), cliente = lire('app/fournisseur.html');
const equipe = lire('app/equipe.html'), comptes = lire('app/equipe/05-liste-et-comptes.js'), style = lire('app/style.css');
verifier('avec « ?voir= », la connexion se lit dans le stockage de session — jamais dans la connexion durable d\'un livreur', /_cltVoirDemande = \/\[\?&\]voir=\/\.test\(window\.location\.search\)/.test(config) && /_pwaPersistentPages\.includes\(_pwaCurrentPage\) && !_cltVoirDemande\)\s*\? window\.localStorage\s*: window\.sessionStorage/.test(config));
const verrou = commun.slice(commun.indexOf('function cltRegarderUnCompte'), commun.indexOf('async function cltOuvrirVueCompte'));
verifier('le verrou interroge la règle À CHAQUE écriture, avec le mode du moment (la bascule agit tout de suite)', /const sort = R\.sortDeLOperation\(op, table, compte, cltModeVue\);\s*return sort === 'laisser' \? vrai\.apply\(null, arguments\) : refuser\(sort\);/.test(verrou) && /^let cltModeVue = 'lecture';/m.test(commun));
verifier('… les fonctions de la base, les fonctions du serveur, les fichiers, et le changement d\'identifiants', /supabaseClient\.rpc = function/.test(verrou) && /functions\.invoke = function/.test(verrou) && /'upload', 'update', 'remove'/.test(verrou) && /auth\.updateUser = function/.test(verrou));
verifier('une écriture refusée répond comme une requête (enchaînable) et ne part jamais', /new Proxy\(/.test(verrou) && /code: 'CLT_LECTURE_SEULE'/.test(verrou));
verifier('chaque table est demandée avec le tri de la personne', /const tri = R\.filtreDeLaTable\(table, compte\);/.test(verrou) && /r\.or\(tri\.valeur\)/.test(verrou) && /r\.in\(tri\.colonne, tri\.valeurs\)/.test(verrou) && /r\.eq\(tri\.colonne, tri\.valeur\)/.test(verrou));
const ouvrir = commun.slice(commun.indexOf('async function cltOuvrirVueCompte'), commun.indexOf('function cltPoserBandeauVueCompte'));
verifier('à l\'ouverture : lecteur vérifié, compte vérifié, bonne page vérifiée — dans cet ordre, avant tout', ouvrir.indexOf('R.peutRegarder(profilDuLecteur)') < ouvrir.indexOf('R.peutEtreRegarde(compte, profilDuLecteur)') && ouvrir.indexOf('R.peutEtreRegarde') < ouvrir.indexOf('R.bonnePage') && ouvrir.indexOf('R.bonnePage') < ouvrir.indexOf('cltRegarderUnCompte(compte)'));
verifier('les lectures personnelles passent par la règle, et nulle part ailleurs', /const sort = R\.sortDeLOperation\('rpc', nom, compte, cltModeVue\);/.test(verrou) && /const d = R\.lectureDeLaBase\(nom, args, compte\); return vraiRpc\(d\.nom, d\.args\);/.test(verrou));
verifier('les boutiques d\'une propriétaire sont lues à l\'ouverture, avant le verrou', ouvrir.indexOf("rpc('mes_boutiques_de'") > 0 && ouvrir.indexOf("rpc('mes_boutiques_de'") < ouvrir.indexOf('cltRegarderUnCompte(compte)'));
verifier('la consultation est notée AVANT le verrou (après, plus rien ne s\'écrit)', ouvrir.indexOf("from('consultations_de_compte').insert") > 0 && ouvrir.indexOf("from('consultations_de_compte').insert") < ouvrir.indexOf('cltRegarderUnCompte(compte)'));
for (const [nom, page] of [['livreur', livreur], ['cliente', cliente]]) {
  verifier(`${nom} : la page charge la règle avant config.js`, page.indexOf('voir-un-compte.js?v=') > 0 && page.indexOf('voir-un-compte.js?v=') < page.indexOf('"config.js?v='));
  verifier(`${nom} : demande non recevable → rien ne s'ouvre`, /if \(vueCompte && vueCompte\.refuse\) \{ window\.location\.replace\(/.test(page));
  verifier(`${nom} : la page vit avec le profil ET l'identifiant de la personne regardée`, /if \(onRegarde\) \{ profile = vueCompte\.compte; currentUser = Object\.assign\(\{\}, session\.user, \{ id: profile\.id \}\); \}/.test(page));
  verifier(`${nom} : ni verrou Face ID, ni notifications, ni présence « en ligne » au nom de la personne`, /CLTBioLock && !onRegarde\) \{ try \{ await CLTBioLock\.guard/.test(page) && /if \(!onRegarde\) cltInitPushButton/.test(page) && /if \(!onRegarde\) initPresence\(profile\)/.test(page));
  verifier(`${nom} : « Se déconnecter » est caché pendant qu'on regarde`, /onclick="logout\(\)" data-cache-si-regarde/.test(page));
}
verifier('la file d\'envoi hors réseau de l\'appareil ne bouge pas pendant qu\'on regarde (un refus y serait compté comme un échec)', /async function flushOfflineQueue\(\)\{\n[^\n]*\n[^\n]*\n\s*if \(typeof cltCompteRegarde !== 'undefined' && cltCompteRegarde\) return;/.test(livreur) && /async function frFileEnvoyer\(\)\{\n[^\n]*\n[^\n]*\n\s*if \(typeof cltCompteRegarde !== 'undefined' && cltCompteRegarde\) return;/.test(cliente));
verifier('et l\'administrateur ne partage la position de personne', /function startPositionSharing\(userId, onError, onEnvoi\) \{\n[^\n]*\n\s*if \(typeof cltCompteRegarde !== 'undefined' && cltCompteRegarde\) return;/.test(config));
verifier('Équipe › Personnes › Comptes : le bouton, pour l\'administrateur seul, jamais sur un compte suspendu', /window\.CLTVoirUnCompte && isAdmin && currentUser && !estSuspendu/.test(comptes) && /class="btn-voir-compte"/.test(comptes) && equipe.indexOf('voir-un-compte.js?v=') > 0);
verifier('il ouvre un nouvel onglet SANS « noopener » : c\'est ce qui lui transmet la connexion', /window\.open\(btn\.dataset\.lien, '_blank'\);/.test(comptes));
const bande = commun.slice(commun.indexOf('function cltPoserBandeauVueCompte'));
verifier('passer en modification demande une confirmation, puis est noté (modification: true)', bande.indexOf('await cltConfirm(') > 0 && bande.indexOf('await cltConfirm(') < bande.indexOf("cltModeVue = 'modification';") && /if \(!oui\) return;/.test(bande) && /cltNoterLaVue\(true\)/.test(bande) && /modification: !!modification/.test(verrou));
verifier('revenir en lecture seule : un appui, sans question', /if \(cltModeVue === 'modification'\) \{ cltModeVue = 'lecture'; cltPoserBandeauVueCompte\(compte\); return; \}/.test(bande));
verifier('en modification le bandeau est ROUGE, de jour comme de nuit ; les boutons de la fiche du compte sont cachés', /\.clt-vue-compte--modifie, html\[data-theme="dark"\] \.clt-vue-compte--modifie\{background:#9B1C1C/.test(style) && /html\.clt-regarde-un-compte #btn-request-delete/.test(style));
verifier('le bandeau : posé en tête de la barre du haut, bouton « Quitter » de 44 px, prévu de nuit', /barre\.insertBefore\(b, barre\.firstChild\)/.test(commun) && /\.clt-vue-compte__quitter\{[^}]*min-height:44px/.test(style) && /html\[data-theme="dark"\] \.clt-vue-compte\{/.test(style));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
