/* LE LIVREUR N'EST PLUS SEUL (20/09/2026, point 20.C, lot « livreurs ») — l'inventaire du 20
   septembre sur l'écran du livreur : une file bloquée sans issue, la nuit qui laisse des blocs
   blancs, les retours qui dorment dans « Tous », « Livré » dit à la place d'« Expédié », la photo
   qui disparaît au premier rendu de fond, le lot refusé hors réseau, et personne à qui parler.
   La règle en base est éprouvée dans un vrai Postgres (tests/signalements, 19 ✅) et l'écran
   dans un vrai Chromium (parcours 18, 24 ✅) ; ce banc vérifie que les fils sont bien tirés. */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(d).slice(0, 300) : '')); } }
const style = (h) => (h.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];

const lv = lire('app/livreur.html'), rl = lire('app/lib/reclamations.js'), rt = lire('app/lib/retours.js');
const e3 = lire('app/equipe/03-file-hors-reseau.js'), e9 = lire('app/equipe/09-express-et-temps-reel.js'), push = lire('supabase-functions/envoyer-push/index.ts');
const css = lire('app/style.css');

console.log('\n1. La file bloquée a deux gestes');
verifier('« Retenter » remet l\'entrée en course et resynchronise', /async function retenterFileBloquee\(colisId\)/.test(lv) && /e\.bloquee = false; e\.tentatives = 0/.test(lv) && /data-file-retenter=/.test(lv));
verifier('« Abandonner et prévenir le bureau » efface l\'entrée, ouvre un signalement, recharge le colis', /async function abandonnerFileBloquee\(colisId\)/.test(lv) && /motif: 'maj_non_enregistree'/.test(lv) && /await queueDelete\(e\.key\)/.test(lv) && /data-file-abandonner=/.test(lv));
verifier('le badge dit pourquoi (conflit ou refus) et le bandeau ne dit plus « prévenez l\'équipe » sans moyen', /blockedSyncMotifs/.test(lv) && /modifié par l\\'équipe entre-temps/.test(lv) && !/dans la liste\. Prévenez l'équipe/.test(lv));

console.log('\n2. Le livreur peut parler au bureau');
verifier('le menu ☰ a « Besoin d\'aide » : Signaler, Appeler CLT, Autre ligne, WhatsApp (numéros de CLT_CONTACT)', /id="btn-signaler-livreur"/.test(lv) && /id="lien-appeler-clt"/.test(lv) && /id="lien-appeler-clt-2"/.test(lv) && /id="lien-whatsapp-clt"/.test(lv));
verifier('la fenêtre écrit dans reclamations_clientes avec auteur = livreur, motifs fermés (lib/reclamations.js)', /auteur: 'livreur', livreur_id: currentUser\.id/.test(lv) && /const MOTIFS_SIGNALEMENT_LIVREUR = \{/.test(rl) && /maj_non_enregistree:/.test(rl) && /function reclamationAuteur\(r\)/.test(rl));
verifier('un bouton par colis, sous « Plus d\'options », pré-choisit le colis', /data-signaler-livreur="\$\{escapeHTML\(c\.id\)\}"/.test(lv) && /ouvrirSignalementLivreur\(sur\.dataset\.signalerLivreur\)/.test(lv));
verifier('il relit ses signalements et la réponse du bureau', /async function chargerMesSignalements\(\)/.test(lv) && /Mes derniers signalements/.test(lv) && /reclamationTexteCliente\(r\)/.test(lv));
verifier('le bureau distingue qui parle (étiquette Livreur / Cliente) et répond « au livreur »', /reclam-eq__qui--livreur/.test(e3) && /Votre réponse au livreur/.test(e3) && /Le livreur' : 'La cliente'/.test(e3) && /\.reclam-eq__qui--livreur\{/.test(css));
verifier('la pastille et le toast le disent aussi', /nbReclamationsLivreurs/.test(e3) && /Un livreur signale un problème/.test(e9));
verifier('la notification poussée va à qui a parlé (livreur_id quand auteur = livreur)', /const livreur = record\.auteur === "livreur"/.test(push) && /livreur \? record\.livreur_id : record\.fournisseur_id/.test(push) && /Un livreur signale un problème/.test(push));

console.log('\n3. La nuit ne laisse plus de blocs blancs');
const st = style(lv);
verifier('la feuille du motif ne s\'appelle plus .motif-echec (collision avec l\'encadré de style.css)', /\.motif-echec-feuille\{ position:fixed/.test(st) && /boite\.className = 'motif-echec-feuille'/.test(lv) && !/^\s*\.motif-echec\{/m.test(st));
verifier('la feuille, Mon mois, l\'annonce de remise et la sélection du signalement ont leur mode nuit', /html\[data-theme="dark"\] \.motif-echec__boite/.test(st) && /html\[data-theme="dark"\] \.mon-mois\{/.test(st) && /html\[data-theme="dark"\] \.annonce-bloc\{/.test(st) && /html\[data-theme="dark"\] \.sig-select/.test(st));
verifier('les bascules d\'argent n\'ont plus de couleurs écrites dans le HTML', /class="btn btn-sm btn-livraison-payee bascule-argent/.test(lv) && /class="btn btn-sm btn-article-non-encaisse bascule-argent/.test(lv) && !/background:#1e8f4e !important; border:1\.5px solid #1e8f4e; color:#fff;'/.test(lv));
verifier('le formulaire « Montant que j\'apporte » est en classes (annonce-champ, annonce-label)', /class="annonce-label">Montant que j'apporte/.test(lv) && /class="annonce-champ">/.test(lv) && !/id="annonce-montant" style=/.test(lv));

console.log('\n4. Les retours, les mots, la photo, le lot');
verifier('« À rendre » : cinquième pastille, compte les retours dans le sac, ignore le calendrier', /const FILTRE_A_RENDRE = 'a_rendre'/.test(lv) && /function colisARendre\(liste\)/.test(lv) && /activeFilterMes === FILTRE_A_RENDRE \|\| matchesDate/.test(lv));
verifier('le livreur sait qu\'un rendu attend la confirmation de la cliente', /en attente de sa confirmation/.test(rt));
verifier('les toasts disent « Expédié » sur une expédition (libelleStatut), y compris le conflit', /const libelle = libelleStatut\(statut, colis\);/.test(lv) && /libelleStatut\(res\.statutPrecedent, avant\)/.test(lv) && /libelleStatut\(s, colis\) : s;/.test(lv));
verifier('la photo choisie survit à un rendu de fond (capturée, reposée par DataTransfer)', /photo: photo \|\| undefined/.test(lv) && /function remettrePhotoChoisie\(groupe, fichier\)/.test(lv) && /new DataTransfer\(\)/.test(lv));
verifier('le bandeau hors-ligne redessine « de fond » quand il vient de la synchronisation', /async function refreshOfflineBanner\(options\)/.test(lv) && /renderAll\(\{ enFond: !!\(options && options\.enFond\) \}\)/.test(lv) && /await refreshOfflineBanner\(\{ enFond: true \}\);/.test(lv));
verifier('hors réseau, le lot passe par la file, une entrée par colis', /if \(horsReseau\) \{[\s\S]{0,900}queueAdd\(\{ colisId: c\.id, statut/.test(lv));
verifier('« Récupéré » depuis la carte efface collecte_depart_at comme depuis la tournée', /statut === 'recupere' && existing && existing\.collecte_depart_at[\s\S]{0,120}extra\.collecte_depart_at = null/.test(lv));
verifier('le repli « sans les détails » n\'est plus silencieux', /mais pas les détails \(motif, tentatives\)/.test(lv));
verifier('les adresses de photo sont échappées dans les trois espaces', !/src="\$\{c\.photo_url\}"/.test(lv) && !/src="\$\{c\.photo_url\}"/.test(lire('app/fournisseur.html')) && !/src="\$\{c\.photo_livraison_url\}"/.test(e3));
verifier('Échap ferme la feuille du motif ; l\'invitation WhatsApp s\'efface seule', /document\.addEventListener\('keydown', touche\);   \/\/ Échap ferme/.test(lv) && /minuterie = setTimeout\(fermer, 20000\)/.test(lv));
verifier('le code mort est parti (livreurLabel, monMoisDerniereCle)', !/function livreurLabel\(/.test(lv) && !/monMoisDerniereCle/.test(lv));

console.log('\n5. Les essais existent');
verifier('l\'essai Postgres et le parcours sont là et lancés', fs.existsSync(path.join(RACINE, 'tests/signalements/le-livreur-signale-en-postgres.py')) && fs.existsSync(path.join(RACINE, 'tests/parcours/le-livreur-n-est-plus-seul.mjs')) && /le-livreur-n-est-plus-seul\.mjs/.test(lire('tests/parcours/lancer.mjs')));

console.log('\n6. Les règles d\'accès, jouées dans un vrai Postgres');
{
  let sortie = '', ok = false;
  try {
    sortie = execFileSync('python3', [path.join(RACINE, 'tests/signalements/le-livreur-signale-en-postgres.py')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
    ok = true;
  } catch (e) { sortie = String((e.stdout || '') + (e.stderr || '')); }
  if (/⏭️/.test(sortie)) {
    console.log('  ⏭️  ' + sortie.split('⏭️')[1].split('\n')[0].trim());
  } else {
    const m = sortie.match(/(\d+) vérifications réussies, (\d+) échouées/);
    verifier('l\'essai en base passe (le livreur ouvre les siens, la cliente ne les voit pas, l\'équipe clôt)', ok && m && m[2] === '0', m ? `${m[1]} réussies, ${m[2]} échouées` : sortie.slice(-500));
  }
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
