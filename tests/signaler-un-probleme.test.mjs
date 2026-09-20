/* SIGNALER UN PROBLÈME — point 7.2, seconde moitié (17 septembre 2026)
   ==========================================================================================
   Il n'existait de réclamation que DANS L'AUTRE SENS : reclamations_livreurs, ouverte par
   l'équipe à propos d'un livreur. Une cliente dont le colis arrive abîmé, dont le montant est
   faux, ou qui ne revoit jamais un colis revenu, n'avait aucun moyen de le dire dans
   l'application. Elle appelle — et ce qu'elle dit au téléphone ne laisse aucune trace : rien ne
   se compte, rien ne remonte, rien ne s'améliore.

   Ce que ce banc protège :
     • des motifs FERMÉS et peu nombreux (on doit pouvoir compter ce qui revient le plus) ;
     • un texte libre TOUJOURS facultatif (un champ obligatoire fait renoncer la moitié des gens) ;
     • une cliente qui ne referme jamais sa propre réclamation ;
     • un bureau qui voit ce qui attend, et ce qui attend depuis trop longtemps ;
     • et, chez la cliente, aucun mot de jargon interne.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const bloc = lire('app/lib/reclamations.js');
const cliente = lire('app/fournisseur.html');
const equipe = lire('app/equipe/03-file-hors-reseau.js');
const style = lire('app/style.css');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 300) : '')); }
}

// Les fonctions pures, exécutées pour de vrai.
const ctx = vm.createContext({ Date, Math, String, Object, console });
vm.runInContext(bloc + '\nfunction todayLocalISODate(){ return "2026-09-17"; }', ctx);
const R = (o) => Object.assign({ id: 'r1', statut: 'ouverte', motif: 'colis_abime', created_at: '2026-09-17T08:00:00Z' }, o || {});
const appel = (nom, ...args) => { ctx.__a = args; return vm.runInContext(`${nom}(...__a)`, ctx); };

console.log('\n1. Les motifs : fermés, peu nombreux, lisibles');
const motifs = vm.runInContext('MOTIFS_RECLAMATION', ctx);
verifier('sept motifs au plus : on choisit en deux touches', Object.keys(motifs).length <= 8 && Object.keys(motifs).length >= 4, Object.keys(motifs).length);
verifier('chacun a une icône et un libellé en français clair', Object.values(motifs).every(m => m.icon && m.label && !/[A-Z]{3,}/.test(m.label)));
verifier('« Autre » existe : on ne coince personne', !!motifs.autre);
verifier('les motifs couvrent les vrais griefs (abîmé, montant, jamais reçu, retour, retard)',
  ['colis_abime','montant_faux','jamais_recu','retour_pas_rendu','retard'].every(k => motifs[k]));
verifier('le libellé se rend avec son icône', /^📦 /.test(appel('motifReclamationTexte', 'colis_abime')), appel('motifReclamationTexte', 'colis_abime'));
verifier('un motif inconnu ne casse rien', typeof appel('motifReclamationTexte', 'venu_dailleurs') === 'string');

console.log('\n2. Ce qui attend, et depuis quand');
verifier('une réclamation ouverte attend', appel('reclamationEnAttente', R()) === true);
verifier('une réclamation prise en charge attend encore', appel('reclamationEnAttente', R({ statut: 'en_cours' })) === true);
verifier('une réclamation résolue n\'attend plus', appel('reclamationEnAttente', R({ statut: 'resolue' })) === false);
verifier('les jours se comptent juste', appel('reclamationJours', R(), '2026-09-17') === 0 && appel('reclamationJours', R({ created_at: '2026-09-12T08:00:00Z' }), '2026-09-17') === 5);

console.log('\n3. Ce que la cliente lit : jamais de jargon');
const phrases = ['ouverte', 'en_cours', 'resolue'].map(st => appel('reclamationTexteCliente', R({ statut: st, reponse: 'Le livreur a été vu, un geste commercial vous est fait.' })));
verifier('ouverte : on accuse réception et on promet une réponse', /Signalement reçu/.test(phrases[0]) && /répondre/.test(phrases[0]), phrases[0]);
verifier('en cours : on dit que c\'est pris en charge', /pris en charge/.test(phrases[1]), phrases[1]);
verifier('résolue : on donne la réponse écrite par le bureau', /traité/.test(phrases[2]) && /geste commercial/.test(phrases[2]), phrases[2]);
verifier('aucun mot interne dans ces phrases', !phrases.some(p => /statut|réclamation|fournisseur_id|base/i.test(p)), JSON.stringify(phrases));

console.log('\n4. Chez la cliente');
verifier('le bouton n\'est proposé que sur un colis dont l\'histoire est faite',
  /\['livre', 'non_livre', 'retour'\]\.includes\(c\.statut\)/.test(cliente));
verifier('un colis déjà signalé montre son état au lieu du bouton', /const r = mesReclamations\[c\.id\];/.test(cliente) && /reclamationTexteCliente\(r\)/.test(cliente));
verifier('on ne peut pas envoyer sans motif', /data-reclam="envoyer" disabled/.test(cliente) && /if \(!motif\) return;/.test(cliente));
verifier('le texte libre reste facultatif', /\(facultatif\)/.test(cliente) && !/required/.test(cliente.slice(cliente.indexOf('reclam-texte') - 400, cliente.indexOf('reclam-texte') + 400)));
verifier('la fenêtre se ferme à Échap et au clic dehors', /if \(e\.key === 'Escape'\) fermer\(\)/.test(cliente) && /if \(e\.target === fond\) return fermer\(\)/.test(cliente));
verifier('un échec d\'envoi le dit, et rend le bouton', /n'a pas pu être envoyé/.test(cliente) && /g\.disabled = false/.test(cliente));
verifier('les signalements sont chargés avec les colis', /await chargerMesReclamations\(\);/.test(cliente));
verifier('les motifs et le champ font 44 px', /\.reclam-motif\{[^}]*min-height:44px/.test(style) && /\.reclam-bouton\{[^}]*min-height:44px/.test(style));

console.log('\n5. Au bureau');
verifier('les réclamations non résolues sont lues, les plus anciennes d\'abord',
  /neq\('statut', 'resolue'\)/.test(equipe) && /order\('created_at', \{ ascending: true \}\)/.test(equipe));
verifier('une pastille compte ce qui est signalé — clientes et, depuis le 20/09 (20.C), livreurs', /'problèmes signalés'/.test(equipe) && /nbReclamationsLivreurs/.test(equipe) && /par des livreurs/.test(equipe));
verifier('le panneau dit qui parle (Cliente / Livreur) et la réponse s\'adresse au bon', /reclam-eq__qui--livreur/.test(equipe) && /Votre réponse au livreur/.test(equipe));
verifier('elle passe au rouge quand quelque chose traîne', /nbReclamationsTard \? 'rouge' : 'ambre'/.test(equipe));
verifier('le bureau peut prendre en charge et répondre (20/09, 20.B) : la pastille redescend', /async function traiterReclamation\(id, geste\)/.test(equipe) && /statut: 'resolue', reponse: reponse \|\| null/.test(equipe) && /data-reclam-geste="en_cours"/.test(equipe) && /data-reclam-geste="resolue"/.test(equipe));
// Depuis le 20/09 (20.G), le « 2 » vit dans SEUILS.reclamationTardJours (clt-common.js).
verifier('« traîne » veut dire plus de SEUILS.reclamationTardJours (2), comme ailleurs sur cet écran', /reclamationJours\(r, aujourdhui\) \|\| 0\) > SEUILS\.reclamationTardJours/.test(equipe) && /reclamationTardJours: 2/.test(lire('app/clt-common.js')));
verifier('la pastille mène aux colis concernés', /case 'reclamations': listeColis\('tous', '', L\.reclamations\)/.test(equipe));
verifier('la carte du colis dit le motif, depuis quand, et le mot de la cliente',
  /function reclamationLigneEquipeHTML\(/.test(equipe) && /motifReclamationTexte\(r\.motif\)/.test(equipe) && /r\.texte \?/.test(equipe));
verifier('les cartes sont redessinées quand les signalements arrivent après elles',
  /!== avantReclam && typeof renderColis === 'function'\) renderColis\(\)/.test(equipe));
verifier('si la table manque, l\'écran d\'équipe tient quand même', /catch \(e\) \{\s*window\.__reclamationsClientes = \[\]/.test(equipe));

console.log('\n6. Une seule source, chargée partout');
['equipe.html', 'livreur.html', 'fournisseur.html', 'login.html', 'gestion.html'].forEach((p) => {
  const h = lire('app/' + p);
  verifier(`${p} charge le bloc avant config.js`, h.includes('lib/reclamations.js?v=') && h.indexOf('lib/reclamations.js?v=') < h.indexOf('config.js?v='));
});
verifier('le bloc ne parle à personne : il décrit, il ne lit ni n\'écrit en base', !/supabaseClient/.test(bloc));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
