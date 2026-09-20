/* LE CENTRE « À TRAITER » (20/09/2026, point 20.B) — ce qui ne va pas, compté par la base, avec
   un geste pour chaque chose. L'inventaire : L'essentiel comptait sur 500 colis, les
   réclamations n'avaient pas de geste, une demande de passage ignorée s'évaporait, les litiges
   n'avaient pas de pastille, le message WhatsApp de la cliente parlait à la voix du livreur.
   La règle de comptage est éprouvée dans un vrai Postgres (tests/a-traiter, 20 ✅) et l'écran
   dans un vrai Chromium (parcours 17, 21 ✅) ; ce banc vérifie que les fils sont bien tirés. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(d).slice(0, 300) : '')); } }

const e3 = lire('app/equipe/03-file-hors-reseau.js'), e6 = lire('app/equipe/06-corrections-et-tournee.js'), e9 = lire('app/equipe/09-express-et-temps-reel.js');
const cf = lire('app/config.js'), fo = lire('app/fournisseur.html'), push = lire('supabase-functions/envoyer-push/index.ts');
console.log('\n1. L\'essentiel compte par la base');
verifier('les compteurs viennent de essentiel_compteurs(), chargés avec le bilan du jour', /rpc\('essentiel_compteurs'\)/.test(e3) && /Promise\.all\(\[chargerReclamationsClientes\(\), chargerEssentielBase\(\)\]\)/.test(e3));
verifier('la page ne compte plus qu\'en repli, et le dit (« ~ »)', /ids\('sans_livreur'\) \|\| cat\.sansLivreur/.test(e3) && /~ historique partiel/.test(e3) && /compté sur toute la base/.test(e3));
verifier('quatre pastilles de plus : litiges, demandes de passage, suppressions, file bloquée', ["'litiges'", "'demandes-passage'", "'suppressions'", "'file-bloquee'"].every(k => e3.includes(k)) && /case 'litiges'/.test(e3) && /case 'demandes-passage'/.test(e3));
verifier('« examiné » est écrit en base (vu_par_bureau_at), plus seulement dans le navigateur', /update\(\{ vu_par_bureau_at: c\.vu_par_bureau_at \}\)/.test(e3));
console.log('\n2. Les réclamations ont leurs gestes');
verifier('un panneau dans L\'essentiel, avec « Je m\'en occupe » et « Répondre et clore »', /function renderReclamationsEquipe\(\)/.test(e3) && /id="aujourdhui-reclamations"/.test(lire('app/equipe.html')) && /data-reclam-geste="en_cours"/.test(e3) && /data-reclam-geste="resolue"/.test(e3));
verifier('la réponse est demandée, écrite, et tracée au journal', /statut: 'resolue', reponse: reponse \|\| null, traitee_at/.test(e3) && /action: 'reclamation_' \+ geste/.test(e3));
verifier('un signalement qui arrive fait un toast sonore ; un litige aussi', /table: 'reclamations_clientes' \}, \(payload\) => \{\s*const r = payload && payload\.new;\s*showTeamToast\('📣'/.test(e9) && /retour_detenteur === 'litige'[^\n]*showTeamToast\('⚠️', 'Litige sur un retour'/.test(e9));
console.log('\n3. Les demandes de passage ne s\'évaporent plus');
verifier('le bureau peut refuser, avec un motif', /async function refuserDemandeDePassage\(id\)/.test(e6) && /statut: 'refusee', motif_refus: motif \|\| null/.test(e6));
verifier('la cliente lit « vue par CLT » (pas « confirmé »), ou le refus et son motif, trois jours durant', /👀 Demande vue par CLT/.test(fo) && /❌ Pas de passage possible/.test(fo) && /isoMoinsJoursCliente\(todayLocalISODate\(\), 3\)/.test(fo));
verifier('les toasts de l\'équipe n\'appellent plus showToast (qui n\'existe que dans Gestion)', !/showToast\(/.test(e6));
console.log('\n4. Le message WhatsApp parle à la bonne voix');
verifier('trois voix : livreur, expéditeur, et les mots de l\'expédition', /const expediteur = i\.voix === "expediteur"/.test(cf) && /est en route vers la gare d'expédition/.test(cf) && /a été expédié/.test(cf));
verifier('la carte de la cliente choisit la voix de l\'expéditeur, celle du livreur la sienne', /const voix = \/fournisseur\\\.html\/\.test\(location\.pathname\) \? "expediteur" : "livreur"/.test(cf));
verifier('les cartes disent si c\'est une expédition', /data-expedition="\$\{estExpedition\(c\)/.test(fo) && /data-expedition="\$\{estExpedition\(c\)/.test(lire('app/livreur.html')) && /data-expedition="\$\{estExpedition\(c\)/.test(e3));
console.log('\n5. Les notifications suivent');
verifier('la cliente est prévenue du départ en livraison', /CLIENT_STATUTS = new Set\(\["recupere", "en_livraison", "livre", "non_livre", "retour"\]\)/.test(push));
verifier('et de la réponse à son signalement, du sort de sa demande de passage, d\'un reversement', /async function handleReclamation/.test(push) && /async function handleDemandeDePassage/.test(push) && /async function handleReversement/.test(push) && /table === "reclamations_clientes"/.test(push));
verifier('la marche à suivre des trois webhooks est écrite', /envoyer_push_reclamations/.test(lire('supabase-functions/PUSH-SETUP.md')));
console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
