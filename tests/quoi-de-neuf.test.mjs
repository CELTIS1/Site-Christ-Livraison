/* « QUOI DE NEUF ? » ET LES AUTOMATISMES DU 16 SEPTEMBRE 2026 (demande de Celtis)
   ==========================================================================================
     1. LES NOUVEAUTÉS : app/nouveautes.json est bien formé, sa première entrée porte l'étiquette
        publiée, le panneau existe, le bandeau et la page de connexion y mènent, le fichier n'est
        jamais servi depuis le cache.
     2. LE COLIS EN MAIN : la migration pose les deux règles (création par l'équipe → récupéré ;
        assignation d'un livreur → récupéré) sans toucher aux récupérations programmées.
     3. LES NOTIFICATIONS : envoyer-push prévient le livreur d'une assignation, d'une récupération
        demandée et d'un changement important, et parle à la cliente d'un colis « entre nos mains ».
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const commun = lire('app/clt-common.js');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}

console.log('\n1. Quoi de neuf ?');
const nouv = JSON.parse(lire('app/nouveautes.json'));
const version = JSON.parse(lire('app/version.json')).version;
verifier('nouveautes.json : des entrées avec version, date, titre et 2 à 6 points courts', Array.isArray(nouv.entrees) && nouv.entrees.length >= 1 && nouv.entrees.every(e => e.version && e.date && e.titre && Array.isArray(e.points) && e.points.length >= 2 && e.points.length <= 6 && e.points.every(p => p.length < 260)));
verifier('la première entrée porte l\'étiquette publiée (' + version + ')', nouv.entrees[0].version === version, nouv.entrees[0].version);
verifier('le panneau cltAfficherNouveautes existe, lit le fichier sans cache et se ferme (Échap, ×, fond)', /function cltAfficherNouveautes\(/.test(commun) && /cltUrlACote\("nouveautes\.json"\), \{ cache: "no-store" \}/.test(commun) && /e\.key === "Escape"/.test(commun));
verifier('le bandeau « Nouvelle version » a un bouton Quoi de neuf ?', /clt-maj-quoi/.test(commun) && /quoi\.addEventListener\("click", function \(\) \{ cltAfficherNouveautes\(\); \}\)/.test(commun));
verifier('après une mise à jour, un mot une seule fois (clt_version_vue)', /localStorage\.getItem\("clt_version_vue"\)/.test(commun) && /localStorage\.setItem\("clt_version_vue", etiquetteLocale\)/.test(commun));
verifier('la page de connexion y mène', /cltAfficherNouveautes\(\)/.test(lire('app/login.html')));
verifier('le service worker ne sert jamais nouveautes.json depuis le cache', /nouveautes\.json'\)\) return;/.test(lire('sw.js')));
verifier('le style du panneau et du bouton est dans style.css', /\.clt-nouveautes__boite/.test(lire('app/style.css')) && /\.clt-maj-quoi/.test(lire('app/style.css')));

console.log('\n2. Le colis enregistré par l\'équipe est déjà entre nos mains (migration)');
const m = path.join(RACINE, '_sql-prive', '2026-09-16-colis-en-main-des-la-creation.sql');
if (fs.existsSync(m)) {
  const sql = fs.readFileSync(m, 'utf8');
  verifier('deux colonnes : cree_par, cree_par_role', /add column if not exists cree_par uuid/.test(sql) && /add column if not exists cree_par_role text/.test(sql));
  verifier('règle 1 : création par equipe/admin sans collecte programmée → recupere', /new\.cree_par_role in \('equipe', 'admin'\)\s+and new\.livreur_collecte_id is null\s+and new\.jour_recuperation_prevu is null then\s+new\.statut := 'recupere'/.test(sql));
  verifier('règle 2 : assignation d\'un livreur sur un tel colis en attente → recupere, jamais pendant une collecte', /old\.livreur_id is distinct from new\.livreur_id\s+and new\.statut = 'en_attente' and old\.statut = 'en_attente'\s+and new\.cree_par_role in \('equipe', 'admin'\)\s+and new\.livreur_collecte_id is null\s+and new\.collecte_depart_at is null/.test(sql));
  verifier('les déclencheurs passent AVANT ceux des horodatages (ordre alphabétique : a_ < h)', /create trigger trg_colis_a_en_main_creation\s+before insert/.test(sql) && /create trigger trg_colis_a_en_main_assignation\s+before update of livreur_id/.test(sql) && 'trg_colis_a_en_main_creation' < 'trg_colis_horodatages_insert');
} else { console.log('  (migration privée absente du dépôt public : rien à vérifier ici)'); }

console.log('\n3. Les notifications du livreur');
const push = lire('supabase-functions/envoyer-push/index.ts');
verifier('assignation : le nouveau livreur, et lui seul, reçoit « Colis confié »', /nouveauLivreur !== ancienLivreur\) \{\s+return await envoyer\(\{ roles: \[\], userIds: \[nouveauLivreur\] \}, "📬 Colis confié"/.test(push));
verifier('récupération demandée : le livreur de collecte reçoit « Récupération à faire »', /userIds: \[nouveauCollecteur\] \}, "🛵 Récupération à faire"/.test(push));
verifier('changement important (adresse, échéance, report, téléphone) : « Colis modifié » au livreur', /"✏️ Colis modifié"/.test(push) && /a_livrer_avant/.test(push) && /reporte_au/.test(push) && /destinataire_telephone/.test(push));
verifier('la cliente lit « est entre nos mains » pour un colis récupéré', /recupere: \{ title: "📦 Colis récupéré", verb: "est entre nos mains" \}/.test(push));
verifier('l\'envoi reste limité aux identifiants valides (uuidOuRien) et aux abonnés', /uuidOuRien\(record\.livreur_id\)/.test(push) && /lireAbonnements\(dest\)/.test(push));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
