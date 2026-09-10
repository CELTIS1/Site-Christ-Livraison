/* À JOUR PARTOUT, APPELER DEPUIS LE COLIS, LES MONTANTS D'UNE EXPÉDITION — 10 septembre 2026
   ==========================================================================================
   Trois demandes de Celtis, le même matin :
     1. « Sur mon téléphone, quand je modifie un colis et que je vais dans les récapitulatifs
        ou les comptes des livreurs, rien n'est à jour : il faut fermer l'application. »
        Cause : un curseur qui ne quitte jamais le dernier champ sur iPhone tenait TOUT
        rafraîchissement en attente. Le curseur ne compte plus que s'il a été touché récemment ;
        les données sont toujours rechargées ; seule la liste des colis attend une saisie réelle ;
        les tableaux annexes se redessinent ; les jours passés des récapitulatifs se rechargent.
     2. « À partir de chaque colis, pouvoir appeler directement la vendeuse — sur tous les comptes. »
     3. « L'équipe doit pouvoir modifier les montants d'une expédition (transporteur, course)
        sans se connecter au compte du livreur. »

   Lancer à la main :  node tests/a-jour-partout-et-appeler.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const config = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');
const fournisseur = fs.readFileSync(path.join(APP, 'fournisseur.html'), 'utf8');
const style = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }
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

/* ---------- 1. Le curseur oublié ne retient plus rien ---------- */
titre('1. Un curseur oublié dans un champ ne retient plus les mises à jour');
{
  // Un document minuscule : un conteneur, un champ dedans, et le curseur dessus.
  const champ = { nodeType: 1, tagName: 'INPUT', matches: (sel) => sel === 'input, select, textarea', type: 'text', value: '' };
  const conteneur = { contains: (el) => el === champ };
  const ecouteurs = {};
  const document_ = { body: {}, activeElement: champ, addEventListener: (type, fn) => { ecouteurs[type] = fn; } };
  const ctx = vm.createContext({ document: document_, Date, WeakMap });
  vm.runInContext('const CLT_CHAMPS_SAISIE = "input, select, textarea";', ctx);
  const debut = config.indexOf('const CLT_CURSEUR_RECENT_MS');
  const fin = config.indexOf('// Y a-t-il, dans cette zone, une saisie');
  vm.runInContext(config.slice(debut, fin), ctx);
  const recent = vm.runInContext('cltChampActifRecent', ctx);
  verifier('les touches sont suivies sur tout le document (input, keydown, change, pointerdown) — pas focusin, que le code déclenche lui-même',
    ['input', 'keydown', 'change', 'pointerdown'].every(t => typeof ecouteurs[t] === 'function') && !ecouteurs.focusin);
  verifier('un champ qui a le curseur mais que personne n\'a touché ne compte pas', recent(conteneur) === false);
  ecouteurs.input({ target: champ });
  verifier('la personne vient d\'y écrire : ça compte', recent(conteneur) === true);
  // On vieillit la touche de 31 secondes.
  vm.runInContext('__cltDerniereTouche', ctx).set(champ, Date.now() - 31000);
  verifier('31 secondes plus tard, le curseur oublié ne compte plus (le seuil est 30 s)', recent(conteneur) === false && vm.runInContext('CLT_CURSEUR_RECENT_MS', ctx) === 30000);
  document_.activeElement = document_.body;
  verifier('sans curseur dans un champ, rien', recent(conteneur) === false);
  const saisie = blocDe(config, 'cltSaisieEnCours', 'config.js');
  verifier('cltSaisieEnCours passe par cette règle, plus par « le curseur est dans un champ » tout court',
    /cltChampActifRecent\(conteneur\)/.test(saisie) && !/conteneur\.contains\(actif\) && actif\.matches/.test(saisie));
  const eq = blocDe(equipe, 'eqSaisieEnCours', 'equipe.html');
  verifier('la garde de la liste des colis (équipe) suit la même règle', /cltChampActifRecent\(liste\)/.test(eq));
}

titre('1. Les données arrivent toujours ; seule la liste attend une saisie réelle');
{
  const fond = blocDe(equipe, 'loadColisEnFond', 'equipe.html');
  verifier('loadColisEnFond ne met plus le CHARGEMENT en attente : il charge, en mode « fond »',
    !/cltDifferSiSaisie\(list, loadColisEnFond\)/.test(fond) && /await loadColis\(\{ enFond: true \}\)/.test(fond));
  const load = blocDe(equipe, 'loadColis', 'equipe.html');
  verifier('loadColis : la mémoire est mise à jour, puis la liste attend (pastille) OU se dessine — et les annexes se dessinent dans les deux cas',
    /allColis = data;/.test(load) && /if \(enFond && list && cltDifferSiSaisie\(list, renderColis\)\) \{\s*[^}]*eqDessinerAnnexes\(\);/.test(load) && /else \{\s*renderColis\(\);/.test(load));
  verifier('loadColis recharge les jours passés des récapitulatifs et le tableau de bord des clientes s\'il est ouvert',
    /recapRechargerJoursPasses\(\);/.test(load) && /eqpanel-clients/.test(load) && /CLTClients\.rafraichir\(\)/.test(load));
  const unefois = blocDe(equipe, 'eqDessinerColisUneFois', 'equipe.html');
  verifier('quand la liste est mise de côté (saisie en cours), les tableaux annexes sont quand même redessinés',
    /eqDessinerAnnexes\(\);\s*return;/.test(unefois));
  const annexes = blocDe(equipe, 'eqDessinerAnnexes', 'equipe.html');
  verifier('les annexes, ce sont bien les récapitulatifs, la comptabilité, l\'essentiel et les colis qui dorment',
    ['renderRecapFournisseur', 'renderRecapLivreur', 'renderCompta', 'renderAujourdhui', 'renderColisQuiDorment'].every(n => annexes.includes(n + '()')));
}

titre('1. Les jours passés des récapitulatifs se rechargent, avec les colis reportés');
{
  const past = blocDe(equipe, 'recapLoadPastDay', 'equipe.html');
  verifier('recapLoadPastDay(date, { forcer }) relit un jour déjà en cache quand on le lui demande', /const forcer = !!\(options && options\.forcer\)/.test(past) && /if \(recapDayCache\[date\] && !forcer\)/.test(past));
  verifier('il ramène les colis reçus ce jour-là OU reportés à ce jour, et garde ceux dont c\'est le jour (jourDuColis)',
    /\.or\(`reporte_au\.eq\.\$\{date\},and\(created_at\.gte\.\$\{date\}T00:00:00,created_at\.lte\.\$\{date\}T23:59:59\)`\)/.test(past) && /filter\(c => jourDuColis\(c\) === date\)/.test(past));
  verifier('un rechargement d\'un jour déjà affiché ne repasse pas par « Chargement… »', /if \(!recapDayCache\[date\]\) recapRedessinerLesDeux\(\);/.test(past));
  const recharge = blocDe(equipe, 'recapRechargerJoursPasses', 'equipe.html');
  verifier('recapRechargerJoursPasses oublie les jours que personne ne regarde et recharge ceux à l\'écran (par client ET par livreur)',
    /recapGetDate\(\), recaplGetDate\(\)/.test(recharge) && /delete recapDayCache\[d\]/.test(recharge) && /recapLoadPastDay\(d, \{ forcer: true \}\)/.test(recharge));
}

titre('1 ter. Le bouton « Actualiser » fait vraiment quelque chose');
{
  const debut = equipe.indexOf("CLTActualiser.installer({\nid: 'btn-actualiser'");
  const bloc = equipe.slice(debut, equipe.indexOf('});\n}', debut));
  verifier('équipe : il force le prochain dessin de la liste (eqForcerProchainRendu), même curseur dans un champ', /eqForcerProchainRendu = true;/.test(bloc) && /if \(!eqForcerProchainRendu && eqSaisieEnCours\(\)\)/.test(blocDe(equipe, 'eqDessinerColisUneFois', 'equipe.html')));
  verifier('équipe : il recharge la liste en direct (loadColis, pas « en fond »)', /await loadColis\(\);/.test(bloc));
  verifier("équipe : il relit l'onglet ouvert — Clients, Tournées, Finances, Suivi, Express", /CLTClients\.rafraichir\(true\)/.test(bloc) && /chargerProgrammations\(\)/.test(bloc) && /renderRapportJour\(\)/.test(bloc) && /loadActivityLog\(\)/.test(bloc) && /loadExpressCourses\(\)/.test(bloc));
  verifier('cliente : il relit la liste ET le relevé du soir', /onActualiser: \(\) => Promise\.all\(\[loadColis\(\), loadReleve\(\)\]\)/.test(fournisseur));
  verifier('livreur : il relit ses colis et sa tournée', /await loadColis\(\);\s*[^]*?await chargerMaTournee\(\);/.test(livreur.slice(livreur.indexOf("CLTActualiser.installer({"))));
}

/* ---------- 2. Appeler depuis le colis ---------- */
titre('2. Appeler le fournisseur et le destinataire depuis chaque colis — les mêmes boutons partout');
{
  // Les deux boutons, écrits une fois dans config.js.
  const ctx = vm.createContext({});
  vm.runInContext(blocDe(fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8'), 'escapeHTML', 'clt-common.js'), ctx);
  vm.runInContext(blocDe(config, 'numeroCompose', 'config.js') + '\n' + blocDe(config, 'formatPhoneDisplay', 'config.js') + '\n' + blocDe(config, 'boutonAppelHTML', 'config.js') + '\n' + blocDe(config, 'boutonAppelDestinataireHTML', 'config.js') + '\n' + blocDe(config, 'boutonAppelFournisseurHTML', 'config.js'), ctx);
  const dest = vm.runInContext('boutonAppelDestinataireHTML', ctx), fourn = vm.runInContext('boutonAppelFournisseurHTML', ctx);
  const bd = dest({ destinataire_telephone: '2250705404655' });
  verifier('« 📞 Destinataire » : un lien tel: vers le numéro, le numéro lisible dans l\'infobulle', /href="tel:2250705404655"/.test(bd) && /📞 Destinataire/.test(bd) && /title="Appeler le destinataire au /.test(bd) && /btn-appel-destinataire/.test(bd));
  const bf = fourn({ phone: '2250102030405', company_name: 'Awa Boutique' });
  verifier('« 📞 Fournisseur » : le nom du fournisseur dans l\'infobulle, jamais « Vendeuse »', /href="tel:2250102030405"/.test(bf) && /📞 Fournisseur/.test(bf) && /Appeler Awa Boutique au/.test(bf) && !/Vendeuse/i.test(bf));
  verifier('sans numéro : pas de bouton', dest({}) === '' && fourn(null) === '' && fourn({ company_name: 'X' }) === '');
  verifier('les mots « Vendeuse » et les boutons d\'en-tête ont disparu des écrans', !/📞 Vendeuse|btn-appel-vendeuse|appelVendeuseHTML/.test(livreur) && !/btn-appel-vendeuse/.test(equipe));
  // Livreur : sur chaque carte de « Ma journée » et de « Récupérations ».
  const tel = blocDe(livreur, 'telephoneLigneHTML', 'livreur.html');
  verifier('livreur, Ma journée : le numéro du destinataire, WhatsApp, puis « 📞 Fournisseur » (boutonAppelFournisseurHTML)', /boutonAppelFournisseurHTML\(c\.fournisseur_id \? profilesById\[c\.fournisseur_id\] : null\)/.test(tel) && /btn-notify-wa/.test(tel));
  verifier('livreur, Récupérations : « 📞 Fournisseur » sur chaque carte, plus rien dans l\'en-tête', /boutonAppelFournisseurHTML/.test(blocDe(livreur, 'recupColisRowHTML', 'livreur.html')) && /return '';/.test(blocDe(livreur, 'recupActionsHTML', 'livreur.html')));
  verifier('livreur : le profil du fournisseur porte bien son téléphone (loadProfiles lit phone)', /select\('id, full_name, company_name, role, avatar_url, phone'\)/.test(livreur));
  // Équipe : les deux boutons sur chaque carte, le nom du client sans numéro mêlé.
  verifier('équipe : « Client : … » ne porte plus de numéro', !/href="tel:/.test(blocDe(equipe, 'eqLigneClientHTML', 'equipe.html')));
  verifier('équipe : les deux boutons (destinataire + fournisseur) sur les trois cartes de colis', /boutonAppelDestinataireHTML\(c\) \+ boutonAppelFournisseurHTML\(/.test(blocDe(equipe, 'eqBoutonsAppelHTML', 'equipe.html')) && (equipe.match(/\$\{eqBoutonsAppelHTML\(c\)\}/g) || []).length === 3);
  verifier('équipe : plus de bouton d\'appel dans l\'en-tête de groupe', !/btn-appel/.test(blocDe(equipe, 'equipeCollecteActionHTML', 'equipe.html')));
  verifier('équipe : les clientes sont lues avec leur téléphone', /select\('id, full_name, company_name, phone, commune_recuperation, adresse_recuperation'\)/.test(equipe));
  const carte = blocDe(fournisseur, 'colisItemHTML', 'fournisseur.html');
  verifier('cliente : « 📞 Appeler » son livreur dès qu\'il est assigné et que son numéro est connu', /telLivreur/.test(carte) && /href="tel:\$\{escapeHTML\(telLivreur\)\}"/.test(carte));
  verifier('cliente : les livreurs sont lus avec leur téléphone', /select\('id, full_name, avatar_url, phone'\)/.test(fournisseur));
  verifier('le style des boutons d\'appel est partagé (style.css)', /\.colis-tel-ligne \.btn-appel/.test(style));
}

/* ---------- 2 bis. Un champ de recherche sur les listes ---------- */
titre('2 bis. Un champ de recherche sur les listes (comptes, en attente, historique, Express)');
{
  const commun = fs.readFileSync(path.join(APP, 'clt-common.js'), 'utf8');
  // Un petit DOM à la main : une liste de trois lignes et un champ.
  const ligne = (t) => ({ tagName: 'DIV', textContent: t, hidden: false, classList: { contains: () => false } });
  const lignes = [ligne('Awa Boutique 07 05 40 46 55'), ligne('Mariam Mode 01 02 03 04 05'), ligne('Côte d\'Ivoire Express')];
  const ajoutes = [];
  const liste = { dataset: {}, querySelectorAll: () => lignes, querySelector: () => ajoutes[0] || null, appendChild: (el) => { ajoutes.push(el); } };
  const ecouteurs = {};
  const champ = { value: '', addEventListener: (t, fn) => { ecouteurs[t] = fn; } };
  const ctx = vm.createContext({ document: { createElement: () => ({ className: '', textContent: '', remove(){ ajoutes.length = 0; } }) }, String });
  vm.runInContext(blocDe(commun, 'cltNormaliserTexte', 'clt-common.js') + '\n' + blocDe(commun, 'cltBrancherFiltreListe', 'clt-common.js'), ctx);
  vm.runInContext('cltBrancherFiltreListe', ctx)(champ, liste);
  champ.value = 'mariam'; ecouteurs.input();
  verifier('« mariam » ne garde que Mariam (majuscules ignorées)', lignes.map(l => l.hidden).join() === 'true,false,true');
  champ.value = 'cote'; ecouteurs.input();
  verifier('« cote » trouve « Côte » (accents ignorés)', lignes.map(l => l.hidden).join() === 'true,true,false');
  champ.value = 'awa 07'; ecouteurs.input();
  verifier('plusieurs mots : tous doivent être présents', lignes.map(l => l.hidden).join() === 'false,true,true');
  champ.value = 'zzz'; ecouteurs.input();
  verifier('aucun résultat : une ligne le dit, avec les mots tapés', ajoutes.length === 1 && /Aucun résultat pour « zzz »/.test(ajoutes[0].textContent));
  champ.value = ''; ecouteurs.input();
  verifier('champ vidé : tout revient, la ligne « aucun résultat » disparaît', lignes.every(l => !l.hidden) && ajoutes.length === 0);
  verifier('équipe : les listes ont leur champ (data-filtre-liste) — comptes, en attente, historique, courses et recharges Express',
    ['all-accounts-list', 'pending-list', 'activity-log-list', 'express-courses-list', 'express-recharges-list'].every(id => new RegExp('data-filtre-liste="' + id + '"').test(equipe)));
  verifier('équipe : les champs sont branchés au démarrage', /brancherFiltresDeListes\(\);/.test(blocDe(equipe, 'init', 'equipe.html')) && /cltBrancherFiltreListe\(champ, liste\)/.test(equipe));
}

/* ---------- 3. Les montants d'une expédition depuis le bureau ---------- */
titre("3. L'équipe corrige les montants d'une expédition sans le compte du livreur");
{
  verifier('la fiche de modification garde ses montants sur une expédition (data-montants-toujours)', /class="montant-block"[^>]*data-montants-toujours/.test(equipe));
  verifier('« Livraison » devient « Frais de course » sur une expédition', /class="libelle-livraison" data-libelle-abidjan="Livraison" data-libelle-expedition="\$\{escapeHTML\(LIBELLE_FRAIS_COURSE\)\}"/.test(equipe));
  verifier('un champ « Frais d\'expédition (transporteur) » (edit-frais-expedition), visible sur une expédition ou si déjà saisi',
    /class="montant-field montant-field-frais-exp" style="\$\{estExpedition\(c\) \|\| fraisExpeditionColis\(c\) > 0 \? '' : 'display:none;'\}"/.test(equipe) && /class="edit-frais-expedition"/.test(equipe));
  verifier('une case « Frais déjà réglés à CLT (soldé) » (edit-frais-soldes), cochée d\'après frais_soldes_at', /class="edit-frais-soldes" \$\{fraisSoldes\(c\) \? 'checked' : ''\}/.test(equipe));
  verifier('à l\'enregistrement : frais_expedition part dans les mêmes colonnes que chez le livreur, frais_soldes_at seulement si la case a changé',
    /updatePayload\.frais_expedition = frais_expedition/.test(equipe) && /if \(fraisSoldesInput\.checked !== etaitSolde\) frais_soldes_at = fraisSoldesInput\.checked \? new Date\(\)\.toISOString\(\) : null;/.test(equipe) && /updatePayload\.frais_soldes_at = frais_soldes_at/.test(equipe));
  verifier('les deux nouveaux champs sont photographiés et reposés si la liste se redessine', /'\.edit-frais-expedition'\]/.test(equipe) && /'\.edit-frais-soldes'\]/.test(equipe));
  const mode = blocDe(config, 'appliquerModeExpedition', 'config.js');
  verifier('appliquerModeExpedition cherche d\'abord la carte du colis (.colis-item), plus la liste entière (.card)', /closest\('form, \.lot-fr-item, \.colis-item, \.card, body'\)/.test(mode));
  verifier('avec data-montants-toujours : pas de masquage ni de vidage, le libellé et la case transporteur suivent la commune',
    /const toujours = !!\(blocMontants && blocMontants\.closest && blocMontants\.closest\('\[data-montants-toujours\]'\)\)/.test(mode)
    && /libelle\.textContent = expedition \? \(libelle\.dataset\.libelleExpedition/.test(mode) && /caseFraisExp\.style\.display = \(expedition \|\| dejaSaisi\) \? '' : 'none'/.test(mode));
  verifier('sur la fiche de modification, les cases sont cachées sans être décochées', /if \(expedition && !toujours\) casePayee\.checked = false;/.test(mode) && /if \(!expedition && !toujours\) caseSoldee\.checked = false;/.test(mode));
  verifier('la case transporteur a sa ligne à elle (style.css)', /\.montant-group \.montant-field-frais-exp\{ flex:1 1 100%; \}/.test(style));
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
