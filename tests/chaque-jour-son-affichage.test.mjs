/* CHAQUE JOUR, SON AFFICHAGE — ET DES MESSAGES QUI DISENT QUELQUE CHOSE — 7 septembre 2026
   ==========================================================================================
   Celtis, depuis l'avion : « il y a des données qui existent depuis la semaine passée qui
   continuent toujours d'exister dans l'onglet récupération, ce n'est pas normal. Chaque jour,
   son affichage. Et quand on remet une date, on tombe sur son affichage. » Puis : « il y a le
   bouton appeler, le bouton WhatsApp et en bas un troisième bouton ; je ne vois que deux
   boutons. Tous les boutons WhatsApp ont des messages bien spécifiques. Même lorsqu'il a mis
   "en livraison", il faudrait que ça déclenche un message pour la personne à qui ça doit être
   livré. »

   Ce banc tient : (1) une cliente hors programme n'entre dans la tournée que le jour de ses
   colis, et les restes des jours passés sont comptés à part pour le bureau ; (2) les deux
   écrans lisent les colonnes qui disent ce jour ; (3) le troisième bouton ne s'efface que si
   la récupération est faite ; (4) chaque message WhatsApp dit sa situation ; (5) après un
   enregistrement de statut, le téléphone propose le message au destinataire.

   Lancer à la main :  node tests/chaque-jour-son-affichage.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const config = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const style = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }
function blocDe(src, nom){
  const debut = src.search(new RegExp('function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  process.exit(1);
}

const ctx = vm.createContext({ Object, Date, String, Number, Math, Map, Set, Array, encodeURIComponent });
[
  'jourAbidjan', 'aujourdhuiAbidjan', 'jourEvenementColis', 'rangDeLaJournee', 'colisAttenduAuPlusTard',
  'dayKey', 'jourDuColis', 'colisHorsProgrammeDuJour', 'departDeCollecte', 'totalDesLignes', 'tourneesDeRecuperation',
  'toPhoneE164', 'numeroCompose', 'numeroInternational', 'messageContactRecuperation', 'lienContactRecuperation',
  'messageDepartRecuperation', 'lienDepartRecuperation', 'messageDestinataire', 'lienMessageDestinataire',
].forEach(n => vm.runInContext(blocDe(config, n), ctx));
const HORODATAGE = config.slice(config.indexOf('const HORODATAGE_DU_STATUT'), config.indexOf('};', config.indexOf('const HORODATAGE_DU_STATUT')) + 2);
vm.runInContext(HORODATAGE, ctx);

const AUJ = '2026-09-07', HIER = '2026-09-06', DEMAIN = '2026-09-08';
const fiche = (id) => ({ F1: { nom: 'Awa', commune: 'Cocody', telephone: '0700000001' }, F2: { nom: 'Bintou', commune: 'Yopougon', telephone: '0700000002' }, F3: { nom: 'Clara', commune: 'Abobo', telephone: '0700000003' } })[id] || {};
const nom = () => 'Koffi';

titre('Un colis hors programme appartient à un seul jour');
{
  const duJour = vm.runInContext('colisHorsProgrammeDuJour', ctx);
  verifier("saisi aujourd'hui, en attente : c'est aujourd'hui", duJour({ statut: 'en_attente', created_at: AUJ + 'T09:00:00Z' }, AUJ));
  verifier("saisi hier, en attente : ce n'est plus aujourd'hui", !duJour({ statut: 'en_attente', created_at: HIER + 'T09:00:00Z' }, AUJ));
  verifier("saisi la semaine passée : ce n'est pas aujourd'hui non plus", !duJour({ statut: 'en_attente', created_at: '2026-08-28T09:00:00Z' }, AUJ));
  verifier("mais hier, en regardant hier, il y était", duJour({ statut: 'en_attente', created_at: HIER + 'T09:00:00Z' }, HIER));
  verifier("le jour prévu par la cliente l'emporte sur le jour de saisie", duJour({ statut: 'en_attente', created_at: HIER + 'T09:00:00Z', jour_recuperation_prevu: AUJ }, AUJ)
    && !duJour({ statut: 'en_attente', created_at: AUJ + 'T09:00:00Z', jour_recuperation_prevu: DEMAIN }, AUJ));
  verifier("un départ déclenché ce jour-là le ramène, même saisi avant", duJour({ statut: 'en_attente', created_at: '2026-08-28T09:00:00Z', collecte_depart_at: AUJ + 'T10:00:00Z' }, AUJ));
  verifier("un colis déjà pris n'est pas « à prendre »", !duJour({ statut: 'recupere', created_at: AUJ + 'T09:00:00Z' }, AUJ));
  verifier('sans colis ou sans jour, non', !duJour(null, AUJ) && !duJour({ statut: 'en_attente', created_at: AUJ + 'T09:00:00Z' }, ''));
}

titre("La tournée d'un jour ne montre que ce jour — et compte les restes pour le bureau");
{
  const tournees = vm.runInContext('tourneesDeRecuperation', ctx);
  const colis = [
    { id: 'A', fournisseur_id: 'F1', statut: 'en_attente', livreur_collecte_id: 'L1', created_at: AUJ + 'T08:00:00Z' },
    { id: 'B', fournisseur_id: 'F2', statut: 'en_attente', livreur_collecte_id: 'L1', created_at: '2026-08-28T08:00:00Z' },
    { id: 'C', fournisseur_id: 'F2', statut: 'en_attente', livreur_collecte_id: 'L1', created_at: '2026-08-29T08:00:00Z' },
    { id: 'D', fournisseur_id: 'F3', statut: 'en_attente', livreur_collecte_id: 'L1', created_at: HIER + 'T08:00:00Z' },
  ];
  const auj = tournees({ jour: AUJ, aujourdHui: AUJ, livreurId: 'L1', programmations: [], colis, cliente: fiche, livreurNom: nom, horsProgramme: true });
  verifier("aujourd'hui : seule Awa (colis saisi ce jour) est dans la tournée", auj.lignes.map(l => l.clienteNom).join(',') === 'Awa', auj.lignes.map(l => l.clienteNom).join(','));
  verifier('les trois colis des jours passés sont comptés à part, pas oubliés', auj.restesDesJoursPasses === 3, String(auj.restesDesJoursPasses));
  const hier = tournees({ jour: HIER, aujourdHui: AUJ, livreurId: 'L1', programmations: [], colis, cliente: fiche, livreurNom: nom, horsProgramme: true });
  verifier("en remettant la date d'hier, on retrouve Clara, et rien d'autre", hier.lignes.map(l => l.clienteNom).join(',') === 'Clara', hier.lignes.map(l => l.clienteNom).join(','));
  const prog = tournees({ jour: AUJ, aujourdHui: AUJ, livreurId: 'L1', programmations: [{ id: 'P1', jour: AUJ, fournisseur_id: 'F2', livreur_id: 'L1' }], colis, cliente: fiche, livreurNom: nom, horsProgramme: true });
  const bintou = prog.lignes.find(l => l.clienteNom === 'Bintou');
  verifier("une cliente PROGRAMMÉE aujourd'hui garde tous ses colis en attente, même anciens", bintou && bintou.nbAPrendre === 2 && !bintou.horsProgramme);
  verifier("et ses colis ne sont plus des restes", prog.restesDesJoursPasses === 1, String(prog.restesDesJoursPasses));
  const sans = tournees({ jour: AUJ, aujourdHui: AUJ, livreurId: 'L1', programmations: [], colis, cliente: fiche, livreurNom: nom });
  verifier("sans l'option hors programme, le compte des restes est zéro (le bureau seul le demande)", sans.restesDesJoursPasses === 0);
}

titre('Les deux écrans lisent les colonnes qui disent le jour');
{
  verifier('le téléphone demande created_at et jour_recuperation_prevu pour ses colis de tournée',
    /collecte_depart_at, created_at, jour_recuperation_prevu'\)/.test(blocDe(livreur, 'chargerColisDeLaTournee')));
  verifier('et relit sans le jour prévu si la colonne manque encore', /colonneAbsente\(attente\.error\)/.test(blocDe(livreur, 'chargerColisDeLaTournee')));
  verifier('le bureau demande les mêmes colonnes', /CHAMPS_COMPLETS = 'id, fournisseur_id, statut, recupere_at, livreur_collecte_id, collecte_depart_at, created_at, jour_recuperation_prevu'/.test(equipe));
  verifier('le bureau affiche les restes des jours passés, pour reprogrammer', /restesDesJoursPasses/.test(equipe) && /prog-restes/.test(equipe) && /à reprogrammer/.test(equipe));
  verifier('le téléphone, lui, ne les affiche pas (chaque jour, son affichage)', !/restesDesJoursPasses/.test(livreur));
}

titre('Le troisième bouton, toujours là tant que la récupération n\'est pas faite');
{
  const rendu = blocDe(livreur, 'renderMaTournee');
  verifier("il ne s'efface que si la récupération chez elle est faite", /const recuperationFaite = plusRienAFaireIci && l\.nbDejaPris > 0/.test(rendu) && /const geste = recuperationFaite\s*\?\s*''/.test(rendu));
  verifier("rien de saisi chez elle : « Prévenir que j'arrive », avec un message", /prevenirSeulement = !recuperationFaite && \(l\.rienARecuperer \|\| annonceSansColisSaisi \|\| plusRienAFaireIci\)/.test(rendu)
    && /tournee-geste--prevenir[^>]*\n\s*href="\$\{escapeHTML\(lienDepartRecuperation\(l\.telephone, infosPrevenir\)\)\}"/.test(rendu));
  verifier('le bouton WhatsApp de la tournée porte le message de config.js', /tournee-contact--whatsapp" href="\$\{escapeHTML\(lienContactRecuperation\(l\.telephone/.test(rendu));
  verifier('le bureau aussi', /tournee-contact--whatsapp" href="\$\{escapeHTML\(lienContactRecuperation\(l\.telephone/.test(equipe));
}

titre('Chaque message dit sa situation');
{
  const contact = vm.runInContext('messageContactRecuperation', ctx);
  const dest = vm.runInContext('messageDestinataire', ctx);
  const lienDest = vm.runInContext('lienMessageDestinataire', ctx);
  const c = contact({ livreurNom: 'Koffi', commune: 'Cocody' });
  verifier('le livreur se présente et demande si les colis sont prêts', /ici Koffi, livreur/.test(c) && /à Cocody/.test(c) && /Sont-ils prêts, et combien/.test(c));
  verifier("depuis le bureau, c'est l'entreprise qui annonce son livreur", /Notre livreur passe/.test(contact({ livreurNom: '', commune: 'Abobo' })) && !/ici ,/.test(contact({})));
  const enRoute = dest({ statut: 'en_livraison', numero: 'CLT-42', livreurNom: 'Koffi', lienSuivi: 'https://christlivraison.ci/suivi.html?numero=CLT-42' });
  verifier('« en livraison » : je suis en route, restez joignable, avec le numéro et le lien', /en route pour vous livrer votre colis CLT-42/.test(enRoute) && /joignable/.test(enRoute) && /suivi\.html\?numero=CLT-42/.test(enRoute));
  verifier('« non livré » : passé sans vous joindre, quand repasser', /sans pouvoir vous joindre/.test(dest({ statut: 'non_livre' })) && /repasser/.test(dest({ statut: 'non_livre' })));
  verifier('« livré » : merci de votre confiance', /vient de vous être livré/.test(dest({ statut: 'livre' })));
  verifier('un statut inconnu ne casse rien', /mis à jour/.test(dest({ statut: 'bizarre' })));
  verifier('le lien va au bon numéro, en international, avec le texte', /^https:\/\/wa\.me\/2250700000001\?text=Bonjour/.test(lienDest('0700000001', { statut: 'livre' })));
  verifier('sans numéro, WhatsApp s\'ouvre quand même sur le texte', /^https:\/\/wa\.me\/\?text=/.test(lienDest('', { statut: 'livre' })));
  verifier('le bouton « Prévenir sur WhatsApp » de config.js emploie le même message', /const msg = messageDestinataire\(\{ statut: statut, numero: numero, lienSuivi: link/.test(config));
}

titre('Après un enregistrement de statut, le téléphone propose le message');
{
  verifier("annoncerChangementStatut appelle proposerMessageDestinataire", /proposerMessageDestinataire\(colis, statut\);/.test(blocDe(livreur, 'annoncerChangementStatut')));
  const prop = blocDe(livreur, 'proposerMessageDestinataire');
  verifier('seulement pour en livraison, non livré et livré', /STATUTS_A_PREVENIR = \['en_livraison', 'non_livre', 'livre'\]/.test(livreur));
  verifier("c'est un vrai lien, pas un window.open après le réseau", /<a class="wa-invite__envoyer" href="\$\{escapeHTML\(lien\)\}" target="_blank" rel="noopener">/.test(prop) && !/window\.open/.test(prop));
  verifier('« Plus tard » referme sans rien faire', /wa-invite__plus-tard/.test(prop));
  verifier('le message est signé du livreur', /livreurNom: \(currentProfile && currentProfile\.full_name\) \|\| ''/.test(prop));
  verifier('la boîte est habillée, au-dessus de la barre d\'onglets', /\.wa-invite\{[^}]*position:fixed/.test(style) && /\.wa-invite__envoyer\{/.test(style));
  verifier('le nom affiché est posé pour les messages de config.js', /window\.cltNomAffiche = profile\.full_name/.test(livreur));
}

titre("Le bureau : d'office la date du jour, un bilan du jour exact, un champ épuré (07/09/2026, second passage)");
{
  verifier("la programmation s'ouvre sur aujourd'hui", /return progJourChoisi \|\| aujourdhuiAbidjan\(\);/.test(blocDe(equipe, 'progGetJour')));
  const bilan = blocDe(equipe, 'chargerBilanDuJour');
  verifier('le bilan du jour est compté par la base, sans rapatrier de lignes', /count: 'exact', head: true/.test(bilan));
  verifier('sur le jour d\'Abidjan, bornes T00:00:00Z et T23:59:59.999Z', /aujourdhuiAbidjan\(\)/.test(bilan) && /T00:00:00Z/.test(bilan) && /T23:59:59\.999Z/.test(bilan));
  verifier('reçus sur created_at, livrés sur livre_at, échecs sur non_livre_at + retour_at, en cours sur le statut',
    /gte\('created_at', debut\)/.test(bilan) && /gte\('livre_at', debut\)/.test(bilan) && /gte\('non_livre_at', debut\)/.test(bilan) && /gte\('retour_at', debut\)/.test(bilan) && /in\('statut', \['recupere', 'en_livraison'\]\)/.test(bilan));
  verifier('il est relancé à chaque chargement de la liste', /\/\/ Les chiffres du jour[^\n]*\nchargerBilanDuJour\(\);\n\}/.test(equipe));
  const rendu = blocDe(equipe, 'renderAujourdhui');
  verifier("tant que la base n'a pas répondu, l'écran le dit d'un « ~ »", /const approx = exact \? '' : '~'/.test(rendu) && /bilanDuJour\.jour === jourAbj/.test(rendu));
  verifier('le champ « colis annoncés » tient sur la ligne de la note, sans paragraphe', /class="field-row prog-note-et-nombre"/.test(equipe) && /id="prog-nb-colis"[^>]*placeholder="—"/.test(equipe) && !/quand vous reposez la tournée avec le vrai nombre/.test(equipe));
}

titre("L'espace cliente aussi : le jour d'office, simple à comprendre (07/09/2026)");
{
  const fournisseur = fs.readFileSync(path.join(APP, 'fournisseur.html'), 'utf8');
  verifier("« Mes colis » s'ouvre sur aujourd'hui", /filtreDate = todayLocalISODate\(\);\n\s*document\.getElementById\('filtre-date-colis'\)\.value = filtreDate;/.test(fournisseur));
  verifier('deux boutons, en clair : « Aujourd\'hui » et « Toutes les dates »', /id="btn-date-aujourdhui"[^>]*>Aujourd'hui</.test(fournisseur) && /id="btn-toutes-dates"[^>]*>Toutes les dates</.test(fournisseur));
  verifier("une journée vide le dit et propose « Voir tous mes colis »", /Aucun colis déposé aujourd'hui\./.test(fournisseur) && /data-voir-toutes-dates/.test(fournisseur));
  verifier('une recherche cherche partout, pas seulement dans la journée', /const dateEffective = searchColis\.trim\(\) \? '' : filtreDate;/.test(fournisseur));
  // Le Récap aussi (Celtis, 07/09/2026 : « côté client je ne remarque pas de changement » — il
  // regardait l'onglet Récap, resté sur « Tous les jours »).
  const jours = blocDe(fournisseur, 'populateJourSelect');
  verifier("le Récap s'ouvre sur aujourd'hui tant que la cliente n'a rien choisi", /const voulu = recapJourChoisi === null \? \(moisCourant \? aujourdhui : ''\) : recapJourChoisi;/.test(jours));
  verifier("« Aujourd'hui » est dans la liste même sans colis", /liste\.unshift\(\{ key: aujourdhui, label: "Aujourd'hui", items: \[\] \}\)/.test(jours));
  verifier("une journée sans colis le dit en une phrase, avec « Voir tout le mois »", /<strong>Aujourd'hui<\/strong>, aucun colis enregistré pour l'instant\./.test(fournisseur) && /selectRecapDay\(''\)"[^>]*>← Voir tout le mois/.test(fournisseur));
  verifier('le choix de la cliente est respecté ensuite', /recapJourChoisi = document\.getElementById\('jour-select'\)\.value;/.test(fournisseur) && /recapJourChoisi = key;/.test(fournisseur));
}

titre("La création des colis (09/09/2026) : livreur de collecte, article soldé, ville sur expédition, adresse complète");
{
  const fournisseur = fs.readFileSync(path.join(APP, 'fournisseur.html'), 'utf8');
  const clients = fs.readFileSync(path.join(APP, 'clients-dashboard.js'), 'utf8');
  verifier('le lot du bureau demande le livreur de collecte une fois, pré-rempli depuis la tournée', /id="lot-livreur-collecte"/.test(equipe) && /function lotProposerLivreurCollecte/.test(equipe) && /livreurCollectePropose: lotLivreurCollecteChoisi\(fournisseur_id\)/.test(equipe));
  verifier('chaque ligne du lot a « Article soldé », et il part dans le colis', /class="lot-solde"/.test(equipe) && /if \(s\.articleSolde\) payload\.article_non_encaisse = true;/.test(equipe));
  verifier('sur une expédition, le champ précision du lot devient « Ville »', /brancherPrecisionExpedition\(div\.querySelector\('\.lot-commune'\), div\.querySelector\('\.lot-dest'\)\)/.test(equipe));
  verifier("la cliente aussi peut cocher « Article soldé » à la création", /class="lotfr-article-solde"/.test(fournisseur) && /article_non_encaisse: !!s\.articleSolde,/.test(fournisseur));
  verifier("et la case se cache sur une expédition, comme « Livraison déjà payée »", /\['\.lotfr-liv-payee', '\.lotfr-article-solde'\]\.forEach/.test(config));
  verifier('les relevés écrivent commune ET adresse (colisDestinationTexte) : relevé cliente, point du livreur, bilan équipe, Excel, tableau de bord', /adresse:\s+colisDestinationTexte\(c\),/.test(config) && /\[c\.numero, colisDestinationTexte\(c\), quoi\]/.test(config) && /Destination: colisDestinationTexte\(c\)/.test(equipe) && /colisDestinationTexte\(c\) \? escapeHTML\(colisDestinationTexte\(c\)\) : '—'/.test(equipe) && /colisDestinationTexte\(c\)/.test(clients));
}

titre("La création plus simple (09/09/2026) : prix proposé, « à livrer avant le », celui qui récupère livre");
{
  const fournisseur = fs.readFileSync(path.join(APP, 'fournisseur.html'), 'utf8');
  const sql = path.join(RACINE, '_sql-prive', '2026-09-09-creation-plus-simple.sql');
  verifier('le lot du bureau propose le prix de livraison d\'après les communes (computePrixLivraison), sans écraser un montant tapé', /computePrixLivraison\(fiche \? \(fiche\.commune_recuperation \|\| ''\) : '', commune\.value\)/.test(equipe) && /!String\(liv\.value \|\| ''\)\.trim\(\)/.test(equipe));
  verifier('« à livrer avant le » se saisit chez la cliente et au bureau, et part en base au bon format', /class="lotfr-avant"/.test(fournisseur) && /class="lot-avant"/.test(equipe) && /a_livrer_avant: \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(s\.aLivrerAvant \|\| ''\) \? s\.aLivrerAvant : null,/.test(fournisseur) && /payload\.a_livrer_avant = s\.aLivrerAvant;/.test(equipe));
  verifier('le livreur le voit sur la carte, en rouge si c\'est aujourd\'hui ou dépassé, et ses urgences passent devant', /function aLivrerAvantHTML\(c\)/.test(livreur) && /colis-avant--urgent/.test(livreur) && /cleAvant\(a\)\.localeCompare\(cleAvant\(b\)\)/.test(livreur));
  verifier('sur le téléphone, celui qui récupère devient le livreur de livraison si personne n\'est posé', /if \(!liste\[idx\]\.livreur_id\) liste\[idx\]\.livreur_id = currentUser\.id;/.test(livreur));
  if (!fs.existsSync(sql)) console.log('  ⏭️  NON VÉRIFIÉ ici : _sql-prive/ n\'est pas publié.');
  else { const t = fs.readFileSync(sql, 'utf8'); verifier('la base fait pareil (déclencheur des horodatages) et crée la colonne a_livrer_avant', /new\.livreur_id := new\.livreur_collecte_id;/.test(t) && /add column if not exists a_livrer_avant date/.test(t)); }
}

titre("L'assignation groupée (09/09/2026) : le bouton « Assigner (n) » lit la bonne liste, la sélection multiple est retirée");
{
  verifier('« Assigner (n) » cherche la liste par sa classe, pas par voisinage (la recherche enveloppe le select)', /const select = groupe \? groupe\.querySelector\('\.select-assign-collecte'\) : null;/.test(equipe) && !/const select = btn\.previousElementSibling;/.test(equipe));
  verifier('le bouton « Sélection multiple » n\'est plus affiché', /id="btn-mode-lot-colis"[^>]*\shidden>/.test(equipe));
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
