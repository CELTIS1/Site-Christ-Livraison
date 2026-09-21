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
verifier('les fonctions de la base qui ÉCRIVENT sont refusées', ['confirmer_recuperation', 'annoncer_ma_remise', 'cliente_repond_au_retour', 'une_fonction_future'].every((n) => R.sortDeLOperation('rpc', n) === 'refuser'));
verifier('celles qui lisent « pour celui qui est connecté » rendent « rien » plutôt que les données du gérant', ['annonce_remise_en_cours', 'mes_boutiques', 'primes_en_cours'].every((n) => R.sortDeLOperation('rpc', n) === 'vide'));
verifier('le message dit ce qui s\'est passé et où agir', /lecture seule/.test(R.MESSAGE_LECTURE_SEULE) && /rien n'a été modifié/.test(R.MESSAGE_LECTURE_SEULE) && /écran Équipe/.test(R.MESSAGE_LECTURE_SEULE));
verifier('le bandeau nomme la personne (la boutique d\'abord) et son rôle en clair', R.bandeau(CLIENTE).titre === 'Lash with Reine (cliente)' && R.bandeau(LIVREUR).titre === 'Hamed K. (livreur)' && /Vous regardez son écran — lecture seule/.test(R.bandeau(LIVREUR).sousTitre));

console.log('\n6. Les pages appliquent la règle, en un seul endroit');
const config = lire('app/config.js'), commun = lire('app/clt-common.js'), livreur = lire('app/livreur.html'), cliente = lire('app/fournisseur.html');
const equipe = lire('app/equipe.html'), comptes = lire('app/equipe/05-liste-et-comptes.js'), style = lire('app/style.css');
verifier('avec « ?voir= », la connexion se lit dans le stockage de session — jamais dans la connexion durable d\'un livreur', /_cltVoirDemande = \/\[\?&\]voir=\/\.test\(window\.location\.search\)/.test(config) && /_pwaPersistentPages\.includes\(_pwaCurrentPage\) && !_cltVoirDemande\)\s*\? window\.localStorage\s*: window\.sessionStorage/.test(config));
const verrou = commun.slice(commun.indexOf('function cltRegarderUnCompte'), commun.indexOf('async function cltOuvrirVueCompte'));
verifier('le verrou coupe les quatre écritures de chaque table', /\['insert', 'update', 'upsert', 'delete'\]\.forEach\(function \(op\) \{ q\[op\] = refuser; \}\)/.test(verrou));
verifier('… les fonctions de la base, les fonctions du serveur, les fichiers, et le changement d\'identifiants', /supabaseClient\.rpc = function/.test(verrou) && /functions\.invoke = function/.test(verrou) && /'upload', 'update', 'remove'/.test(verrou) && /auth\.updateUser = function/.test(verrou));
verifier('une écriture refusée répond comme une requête (enchaînable) et ne part jamais', /new Proxy\(/.test(verrou) && /code: 'CLT_LECTURE_SEULE'/.test(verrou));
verifier('chaque table est demandée avec le tri de la personne', /const tri = R\.filtreDeLaTable\(table, compte\);/.test(verrou) && /r\.or\(tri\.valeur\)/.test(verrou) && /r\.eq\(tri\.colonne, tri\.valeur\)/.test(verrou));
const ouvrir = commun.slice(commun.indexOf('async function cltOuvrirVueCompte'), commun.indexOf('function cltPoserBandeauVueCompte'));
verifier('à l\'ouverture : lecteur vérifié, compte vérifié, bonne page vérifiée — dans cet ordre, avant tout', ouvrir.indexOf('R.peutRegarder(profilDuLecteur)') < ouvrir.indexOf('R.peutEtreRegarde(compte, profilDuLecteur)') && ouvrir.indexOf('R.peutEtreRegarde') < ouvrir.indexOf('R.bonnePage') && ouvrir.indexOf('R.bonnePage') < ouvrir.indexOf('cltRegarderUnCompte(compte)'));
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
verifier('le bandeau : posé en tête de la barre du haut, bouton « Quitter » de 44 px, prévu de nuit', /barre\.insertBefore\(b, barre\.firstChild\)/.test(commun) && /\.clt-vue-compte__quitter\{[^}]*min-height:44px/.test(style) && /html\[data-theme="dark"\] \.clt-vue-compte\{/.test(style));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
