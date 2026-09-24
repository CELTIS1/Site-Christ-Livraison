/* À CONFIER — chantier N, lot 17 (25 septembre 2026)
   ==========================================================================================
   Celtis : « l'enregistrement des colis depuis la création jusqu'à l'assignation doit être
   simplifié […] l'assignation se fait plus tard car on ne sait pas d'office quel livreur va livrer ».

   CE QUE CE BANC GARDE
     1. La règle : qui attend un livreur, regroupé par cliente, le bon champ selon l'état.
     2. L'écran : un bloc « À confier » en tête de l'onglet Colis, un livreur et un bouton par
        cliente, une écriture par champ, annulable ; la saisie sait ajouter un colis sans photo ;
        après « Enregistrer », le bloc s'ouvre sur la cliente.
     3. La base : un colis créé au bureau un jour où la cliente a une tournée reste « en attente »
        et va au livreur de la tournée (SQL du lot, à jouer par Celtis).
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}
const ctx = vm.createContext({ window: {}, console });
vm.runInContext(lire('app/a-confier.js'), ctx);
const A = ctx.window.CLTAConfier;
const AUJ = '2026-09-25';

console.log('\n1. La règle');
const colis = [
  { id: 'a', statut: 'recupere', fournisseur_id: 'F1', created_at: '2026-09-25T08:00:00Z' },
  { id: 'b', statut: 'recupere', fournisseur_id: 'F1', created_at: '2026-09-25T08:01:00Z' },
  { id: 'c', statut: 'en_attente', fournisseur_id: 'F1', created_at: '2026-09-25T07:00:00Z' },
  { id: 'd', statut: 'en_attente', fournisseur_id: 'F2', created_at: '2026-09-24T18:00:00Z' },
  { id: 'e', statut: 'recupere', fournisseur_id: 'F2', created_at: '2026-09-25T09:00:00Z', livreur_id: 'L1' },
  { id: 'f', statut: 'en_attente', fournisseur_id: 'F3', created_at: '2026-09-25T09:00:00Z', livreur_collecte_id: 'L2' },
  { id: 'g', statut: 'en_livraison', fournisseur_id: 'F3', created_at: '2026-09-25T09:00:00Z' },
  { id: 'h', statut: 'livre', fournisseur_id: 'F3', created_at: '2026-09-25T09:00:00Z' },
];
verifier('attend un livreur : récupéré sans livreur_id, en attente sans livreur_collecte_id ; pas les autres', A.attendUnLivreur(colis[0]) && A.attendUnLivreur(colis[2]) && !A.attendUnLivreur(colis[4]) && !A.attendUnLivreur(colis[5]) && !A.attendUnLivreur(colis[6]) && !A.attendUnLivreur(colis[7]));
const G = A.groupesAConfier(colis, { aujourdhui: AUJ, nomCliente: (id) => ({ F1: 'Mariam Mode', F2: 'Awa Boutique' })[id] });
verifier('deux groupes, le plus ancien d\'abord (Awa, d\'hier)', G.length === 2 && G[0].nom === 'Awa Boutique' && G[1].nom === 'Mariam Mode', JSON.stringify(G.map(g => g.nom)));
verifier('Mariam : 3 colis — 2 à livrer, 1 à récupérer — depuis 7 h, pas en retard', G[1].nb === 3 && G[1].nbLivraison === 2 && G[1].nbCollecte === 1 && G[1].depuis === '2026-09-25T07:00:00Z' && !G[1].enRetard);
verifier('Awa : 1 colis d\'hier → en retard', G[0].nb === 1 && G[0].enRetard);
const E = A.ecrituresPourConfier(G[1].colis, 'L9');
verifier('confier Mariam à L9 = deux écritures : livreur_id pour a, b ; livreur_collecte_id pour c', E.length === 2 && JSON.stringify(E.find(e => e.champ === 'livreur_id').ids) === '["a","b"]' && JSON.stringify(E.find(e => e.champ === 'livreur_collecte_id').ids) === '["c"]', JSON.stringify(E));
verifier('rien sans livreur ; rien pour un colis déjà chez ce livreur', A.ecrituresPourConfier(G[1].colis, '').length === 0 && A.ecrituresPourConfier([{ id: 'x', statut: 'recupere', livreur_id: 'L9' }], 'L9').length === 0);
verifier('la phrase dit combien, à qui, et ce que ça veut dire', A.phraseConfie(E, 'Koffi') === '3 colis confiés à Koffi — 2 à livrer, 1 à récupérer chez la cliente.', A.phraseConfie(E, 'Koffi'));
verifier('le résumé du bloc', A.resume(G, AUJ) === '4 colis à confier · 2 clientes · 1 depuis avant aujourd\'hui' && A.resume([], AUJ) === 'Tout a un livreur.', A.resume(G, AUJ));

console.log('\n2. L\'écran');
const eq = lire('app/equipe.html'), ecran = lire('app/equipe/19-a-confier.js'), saisie = lire('app/equipe/01-saisie-en-lot.js'), onglets = lire('app/equipe/10-onglets.js'), css = lire('app/style.css'), essentiel = lire('app/equipe/03-file-hors-reseau.js');
verifier('un bloc #a-confier en tête de l\'onglet Colis, AVANT la saisie et la liste', /id="a-confier"/.test(eq) && eq.indexOf('id="a-confier"') < eq.indexOf('id="section-lot-colis"') && /a-confier\.js\?v=/.test(eq) && /19-a-confier\.js\?v=/.test(eq));
verifier('une ligne par cliente : un choix de livreur (data-confier-livreur) et UN bouton « Confier (n) » (data-confier-ok) ; chaque colis se décoche', /data-confier-livreur/.test(ecran) && /data-confier-ok/.test(ecran) && /data-confier-colis/.test(ecran));
verifier('l\'écran passe par la règle (groupesAConfier, ecrituresPourConfier) et écrit le bon champ, une requête par champ', /CLTAConfier\.groupesAConfier\(/.test(ecran) && /CLTAConfier\.ecrituresPourConfier\(/.test(ecran) && /update\(\{ \[e\.champ\]: e\.livreur_id \}\)\.in\('id', e\.ids\)/.test(ecran));
verifier('annulable depuis le message (« Annuler »), et tracé dans activity_log (colis_confies)', /action: \{ label: /.test(ecran) && /colis_confies/.test(ecran));
verifier('redessiné quand la liste des colis change, et après un enregistrement de la saisie (clt:colis-change)', /clt:colis-change/.test(ecran) && /clt:colis-change/.test(saisie));
verifier('après « Enregistrer », le bloc s\'ouvre sur la cliente (data-confier-cliente surlignée)', /aConfierMontrer\(/.test(saisie) && /data-confier-cliente/.test(ecran));
verifier('la saisie sait ajouter un colis SANS photo (bouton #lot-ligne-vide), comme chez la cliente', /id="lot-ligne-vide"/.test(eq) && /lot-ligne-vide/.test(saisie));
verifier('L\'essentiel : « à confier » mène au bloc, pas à un filtre', /aConfierMontrer/.test(essentiel));
verifier('style : lignes ≥ 44 px, retard en orange encre, mode nuit', /\.confier-ok\{[^}]*min-height:44px/.test(css) && /\.confier-retard/.test(css) && /html\[data-theme="dark"\] \.confier-groupe/.test(css));
verifier('20 fichiers d\'équipe (19-a-confier.js compté par decoupage-de-config)', /19-a-confier/.test(lire('tests/decoupage-de-config.test.mjs')));

console.log('\n3. La base');
const sql = lire('_sql-prive/2026-09-25-la-tournee-garde-le-colis-en-attente.sql');
verifier('colis_en_main_a_la_creation ne fait plus naître « récupéré » un colis dont la cliente a une tournée ce jour-là', /create or replace function public\.colis_en_main_a_la_creation\(\)/.test(sql) && /programmations_collecte/.test(sql) && /not exists/.test(sql));
verifier('le script se vérifie lui-même (select … as ok)', /as ok/.test(sql));

console.log(`\n${reussies} vérifications réussies, ${echouees} en échec.`);
if (echouees) process.exit(1);
