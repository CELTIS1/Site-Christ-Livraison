/* QUI REÇOIT QUOI — LES NOTIFICATIONS, REMISES D'APLOMB (21 septembre 2026)
   ==========================================================================================
   Celtis : « les colis se remplissent, les points se remplissent, et puis on n'est pas
   informé. […] Lorsque tous les colis d'un fournisseur sont traités, il faudrait qu'on ait une
   notification […] pour pouvoir déjà commencer à régler son point. Et lorsqu'un livreur finit
   aussi son point, il faut qu'on soit informé. »

   CE QU'ON A MESURÉ DANS LE PROJET EN LIGNE, le 21/09 :
     • la fonction `envoyer-push` déployée datait du 16/09 — « en livraison » n'était donc pas
       notifié à la cliente, et tout le code « autour du colis » du 20/09 dormait ;
     • il n'existait que DEUX branchements sur les cinq attendus.
   ET CE QU'ON A COMPRIS EN CHEMIN : l'équipe recevait une notification par changement de
   statut et par colis — de l'ordre de 180 par jour. Un téléphone qui sonne 180 fois ne
   prévient plus de rien. Celtis a tranché : on coupe.

   Ce banc lit la source de la fonction serveur et les deux migrations, et tient la règle :
   la cliente et le livreur gardent tout, l'équipe ne reçoit plus que des décisions.
   Lancer à la main :  node tests/qui-recoit-quoi.test.mjs
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 300) : '')); }
}

/* LES DEUX MIGRATIONS NE SONT PAS DANS CE DÉPÔT, ET C'EST VOULU : il est PUBLIC, et un script
   qui décrit des déclencheurs et des règles d'accès n'y a pas sa place (.gitignore, « exports
   et dumps »). Elles vivent sur le Mac, dans _sql-prive/, et elles ont été jouées puis
   éprouvées dans un vrai Postgres — cinq cas : journée qui se boucle, qui se rouvre, colis
   reporté d'un jour à l'autre, colis qui change de cliente, colis supprimé.
   Ce que CE banc peut tenir, il le tient : la fonction serveur, et le mode d'emploi qui décrit
   la règle. Un mode d'emploi faux se paie plus cher qu'un code faux — c'est lui qu'on relit
   dans six mois. */
const push = lire('supabase-functions/envoyer-push/index.ts');
const setup = lire('supabase-functions/PUSH-SETUP.md');
const primes = lire('app/lib/primes.js');
// À plat, et sans les « > » des citations : le mode d'emploi coupe ses lignes où il veut,
// et un contrôle qui dépend de l'endroit où une phrase se coupe ne tient rien.
const setupPlat = setup.replace(/^>\s?/gm, '').replace(/\s+/g, ' ');

// Le corps de handleColis, pour parler de CE qui s'y passe et non d'ailleurs.
const handleColis = push.slice(push.indexOf('async function handleColis'), push.indexOf('async function handleReclamation'));

console.log('\n1. L\'ÉQUIPE NE REÇOIT PLUS LE COLIS PAR COLIS');
verifier('les destinataires d\'un changement de statut ne contiennent plus « equipe » ni « admin »',
  /const dest: Destinataires = \{ roles: \[\], userIds: \[\] \};/.test(handleColis)
  && !/roles: \["equipe", "admin"\]/.test(handleColis),
  (handleColis.match(/const dest: Destinataires = [^;]*/) || [''])[0]);
verifier('… et sans personne à prévenir, on n\'envoie rien du tout',
  /if \(dest\.userIds\.length === 0\) return new Response\("aucun destinataire"/.test(handleColis));
verifier('la raison est écrite dans le fichier, pas seulement dans une note de version',
  /QUI REÇOIT QUOI/.test(push) && /cent quatre-vingts notifications/.test(push));
verifier('mais l\'équipe reste prévenue de ce qui APPELLE UNE DÉCISION : signalements et demandes de passage',
  /roles: \["equipe", "admin"\], userIds: \[\] \}, livreur \? "📣 Un livreur signale un problème"/.test(push)
  && /roles: \["equipe", "admin"\], userIds: \[\] \}, "🗓️ Demande de passage"/.test(push));

console.log('\n2. LA CLIENTE, ELLE, GARDE TOUT — ET APPREND POURQUOI');
verifier('ses cinq étapes sont là, « en livraison » comprise',
  /const CLIENT_STATUTS = new Set\(\["recupere", "en_livraison", "livre", "non_livre", "retour"\]\);/.test(handleColis));
verifier('le MOTIF de l\'échec voyage avec la notification',
  /newStatut === "non_livre" && record\.motif_non_livraison/.test(handleColis)
  && /\$\{motif \? " — " \+ motif : ""\}/.test(handleColis));
verifier('… avec exactement les mots du livreur, repris de lib/primes.js',
  ['client absent', 'commande annulée', 'mauvais numéro ou adresse', 'le client a refusé']
    .every((m) => push.toLowerCase().includes(m.toLowerCase()))
  && ['client_absent', 'annule', 'mauvais_numero', 'refus_client', 'autre']
    .every((c) => new RegExp(c + ':').test(push) && new RegExp(c + ':').test(primes)));
verifier('« le livreur dit vous l\'avoir rendu » la prévient : c\'est le seul geste qu\'on attend d\'elle',
  /const rendu = record\.retour_rendu_at;/.test(handleColis)
  && /"↩️ Un colis vous a été rendu"/.test(handleColis));
verifier('… une seule fois, à l\'apparition de la date, et jamais sur un retour déjà confirmé',
  /rendu && !renduAvant && !record\.retour_confirme_at/.test(handleColis));
verifier('le livreur garde ses trois alertes : colis confié, récupération à faire, colis modifié',
  /"📬 Colis confié"/.test(push) && /"🛵 Récupération à faire"/.test(push) && /"✏️ Colis modifié"/.test(push));

console.log('\n3. LES DEUX ALERTES QUE CELTIS A DEMANDÉES');
verifier('une journée bouclée prévient le bureau, avec le nom de la cliente et son compte',
  /async function handleJourneeBouclee/.test(push)
  && /"✅ Journée bouclée : " \+ nom/.test(push)
  && /Son point peut être réglé/.test(push));
verifier('le point d\'un livreur prévient le bureau, avec le montant annoncé',
  /async function handleAnnonceRemise/.test(push)
  && /" a fait son point"/.test(push) && /montant\.toLocaleString\("fr-FR"\)/.test(push));
verifier('… et l\'écart avec ce qu\'il porte, quand il y en a un',
  /const ecart = Number\.isFinite\(porte\) \? porte - montant : 0;/.test(push)
  && /écart de \$\{ecart\.toLocaleString\("fr-FR"\)\}/.test(push));
verifier('le point d\'un livreur ne part que sur une ligne NOUVELLE',
  /async function handleAnnonceRemise[\s\S]{0,200}if \(eventType !== "INSERT"\) return new Response\("rien à dire"/.test(push));

console.log('\n3 bis. LA JOURNÉE QUI CHANGE APRÈS COUP — LA QUESTION DE CELTIS');
/* Celtis, en relisant : « il y a cinq colis, un était non livré, plus tard le client appelle
   pour qu'on le livre. Et si on le livre, on va changer le point. Qu'est-ce qui va se passer ? »
   Le vrai danger n'est pas la seconde notification : c'est le point déjà réglé qui devient faux. */
verifier('un premier bouclage dit « son point peut être réglé »',
  /if \(eventType === "INSERT"\) \{\s*return await envoyer\(\{ roles: \["equipe", "admin"\][\s\S]{0,120}"✅ Journée bouclée : " \+ nom/.test(push));
verifier('un changement après coup dit AUTRE CHOSE : « le point est à revoir »',
  /"♻️ La journée de " \+ nom \+ " a changé"/.test(push)
  && /Si son point est déjà réglé, il est à revoir/.test(push));
verifier('… avec ce qui a changé, chiffre contre chiffre',
  /\$\{livres\} livré\$\{livres > 1 \? "s" : ""\} au lieu de \$\{livresAvant\}/.test(push));
verifier('une réécriture qui ne change aucun chiffre ne dit rien',
  /if \(n === nAvant && livres === livresAvant\) return new Response\("rien n'a changé"/.test(push));
verifier('et une journée ROUVERTE se tait : on attend qu\'elle se referme',
  /if \(record\.en_cours\) return new Response\("journée rouverte, rien à dire"/.test(push));
verifier('le mode d\'emploi décrit les deux messages, pas seulement le premier',
  /DEUX MESSAGES, ET ILS NE DISENT PAS LA MÊME CHOSE/.test(setupPlat)
  && /♻️ La journée de … a changé/.test(setupPlat)
  && /le point déjà réglé qui devient faux/.test(setupPlat));
verifier('le nom du livreur manquant ne retient pas l\'alerte : l\'argent passe avant le confort',
  /catch \(_e\) \{ \/\* le nom est un confort/.test(push));
verifier('les deux tables sont aiguillées dans le routeur',
  /if \(table === "journees_bouclees"\) return await handleJourneeBouclee/.test(push)
  && /if \(table === "annonces_remise"\) return await handleAnnonceRemise/.test(push));

console.log('\n4. LE MODE D\'EMPLOI DIT LA RÈGLE, ET DIT VRAI');
verifier('il porte le tableau « qui reçoit quoi »',
  /Qui reçoit quoi — la règle du 21 septembre 2026/.test(setup)
  && /Plus rien colis par colis/.test(setup));
verifier('il dit le chiffre mesuré, qui est la raison de la coupe',
  /180 par jour/.test(setup));
verifier('il définit « bouclée » : plus aucun colis du jour en attente, récupéré ou en livraison',
  /« en attente », « récupéré » ou « en livraison »/.test(setup));
verifier('… et dit ce que devient une journée ROUVERTE : silence, et sa ligne n\'est pas supprimée',
  /Journée \*\*rouverte\*\* \(`en_cours = true`\) : silence/.test(setupPlat)
  && /la supprimer ferait repartir un « premier bouclage »/.test(setupPlat));
verifier('… et qu\'une correction sur un vieux colis ne fait pas sonner',
  /aujourd'hui et hier/.test(setup));
verifier('les sept branchements sont listés avec leurs événements',
  ['envoyer_push_colis', 'envoyer_push_express_courses', 'envoyer_push_reclamations',
   'envoyer_push_passages', 'envoyer_push_reversements', 'envoyer_push_journees',
   'envoyer_push_remises'].every((n2) => setup.includes(n2)));
verifier('reversements et remises n\'écoutent que les INSERT ; les journées écoutent aussi les UPDATE',
  /`envoyer_push_reversements` \| `reversements_clientes` \| INSERT \|/.test(setup)
  && /`envoyer_push_journees` \| `journees_bouclees` \| INSERT, UPDATE \|/.test(setup)
  && /`envoyer_push_remises` \| `annonces_remise` \| INSERT \|/.test(setup));

console.log('\n5. L\'INCIDENT DU 21/09 A LAISSÉ UNE RÈGLE ÉCRITE');
verifier('le mode d\'emploi raconte ce qui s\'est passé, sans le minimiser',
  /Règle née d'un incident/.test(setup) && /clé `service_role`/.test(setup));
verifier('… et pose l\'interdit : ne jamais faire afficher une définition de déclencheur',
  /Ne JAMAIS demander à la base d'afficher une définition de déclencheur qui porte un en-tête HTTP/.test(setupPlat));
verifier('il dit comment lister sans risque : le nom, la table, l\'état',
  /n'afficher que `tgname`, `relname` et l'état/.test(setup));
verifier('les quatre gestes restants sont numérotés, dans l\'ordre',
  /1\. Changer la clé `service_role`/.test(setup) && /2\. Recréer `envoyer_push_colis`/.test(setup)
  && /3\. \*\*Redéployer\*\* `envoyer-push`/.test(setup) && /4\. Jouer `2026-09-21-journee-bouclee\.sql`/.test(setup));
verifier('le script de branchement est dit hors dépôt, et pourquoi',
  /sur le Mac, hors dépôt : ce dépôt est public/.test(setupPlat));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
