/* CLT EXPRESS — L'ARGENT FIGÉ, L'ACCEPTATION PAR LE SERVEUR, LES RÉGLAGES (point 20.A, 20/09/2026)
   ==========================================================================================
   L'inventaire du 20/09 : un client pouvait mettre le prix de sa course à 0, un coursier relever
   sa part avant de marquer « livrée », tout coursier lisait le téléphone de tous les
   destinataires, le client ne voyait jamais le nom de son coursier, et les réglages d'Express
   n'existaient que dans l'éditeur SQL. La règle elle-même est éprouvée dans un vrai Postgres
   (tests/express/l-argent-fige-en-postgres.py, 30 vérifications) ; ce banc vérifie que les
   écrans passent bien par elle.
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

console.log('\n1. La migration (dossier privé, hors dépôt : vérifiée seulement si elle est là)');
const MIG = path.join(RACINE, '_sql-prive', '2026-09-20-express-l-argent-fige.sql');
if (fs.existsSync(MIG)) {
  const m = fs.readFileSync(MIG, 'utf8');
  verifier('un trigger BEFORE UPDATE fige prix, commission, part du coursier, distance, client', /create trigger express_courses_figer_argent\s+before update/.test(m) && /new\.prix_total\s+:= old\.prix_total/.test(m) && /new\.commission_montant\s+:= old\.commission_montant/.test(m) && /new\.montant_coursier\s+:= old\.montant_coursier/.test(m) && /new\.client_id\s+:= old\.client_id/.test(m));
  verifier('un trigger BEFORE INSERT remet le prix au serveur', /create trigger express_courses_avant_creation\s+before insert/.test(m));
  verifier('les transitions hors métier sont refusées', /raise exception 'transition_interdite/.test(m));
  verifier('accepter et rendre : deux fonctions serveur, atomiques', /create or replace function public\.express_accepter_course\(p_course uuid\)/.test(m) && /raise exception 'deja_prise'/.test(m) && /raise exception 'solde_insuffisant'/.test(m) && /create or replace function public\.express_rendre_course\(p_course uuid\)/.test(m));
  verifier('le coursier ne lit plus les courses en attente dans la table', /create policy "Coursier voit ses courses"[\s\S]{0,120}using \(coursier_id = auth\.uid\(\)\);/.test(m) && /drop policy if exists "Coursier accepte une course disponible"/.test(m));
  verifier('la liste des courses disponibles ne dit plus le destinataire, et marche sans position', /null::text as destinataire_nom, null::text as destinataire_telephone/.test(m) && /p_lat is null or p_lng is null/.test(m));
  verifier('chacun lit l\'autre partie de sa course, par une fonction serveur (pas de récursion de règles)', /create policy profiles_select_express_contrepartie/.test(m) && /using \(public\.express_contrepartie_de\(profiles\.id\)\)/.test(m));
  verifier('les deux fonctions des primes sont fermées', /revoke all on function public\.primes_parametres_pour\(date\) from public, anon, authenticated/.test(m) && /revoke all on function public\.primes_mesures_livreur\(uuid, date\) from public, anon, authenticated/.test(m));
  verifier('express_config gagne les deux colonnes que l\'écran lisait déjà', /add column if not exists vitesse_moy_kmh/.test(m) && /add column if not exists delai_prise_en_charge_min/.test(m));
} else {
  console.log('  ⏭️  _sql-prive absent : la migration n\'est pas vérifiée ici.');
}

console.log('\n2. L\'écran du coursier passe par le serveur');
const co = lire('app/express-coursier.html');
verifier('accepter = rpc express_accepter_course, plus d\'update direct vers « acceptee »', /rpc\('express_accepter_course', \{ p_course: id \}\)/.test(co) && !/update\(\{ status: 'acceptee'/.test(co));
verifier('solde_insuffisant et deja_prise sont expliqués au coursier', /solde_insuffisant/.test(co) && /deja_prise/.test(co));
verifier('sans GPS : la même fonction, sans position — plus de lecture de la table', /rpc\('express_courses_proximite', \{ p_lat: null, p_lng: null \}\)/.test(co) && !/\.eq\('status', 'en_attente'\)/.test(co));
verifier('les courses en attente sont relues toutes les 20 s tant qu\'il est disponible', /setInterval\(\(\) => \{ if \(currentProfile && currentProfile\.disponible_express[^}]*loadDisponibles\(\); \}, 20000\)/.test(co));
verifier('« Je ne peux pas la faire » rend une course acceptée (rpc express_rendre_course)', /btn-rendre-course/.test(co) && /rpc\('express_rendre_course', \{ p_course: id \}\)/.test(co));
verifier('la carte d\'une course disponible ne cherche pas le destinataire', !/function disponibleRowHTML[\s\S]{0,1500}destinataire_telephone/.test(co));

console.log('\n3. Le bureau règle Express dans l\'application');
const eq = lire('app/equipe.html'), js9 = lire('app/equipe/09-express-et-temps-reel.js'), js10 = lire('app/equipe/10-onglets.js');
verifier('une carte « CLT Express — Réglages », réservée à l\'administrateur, dans l\'onglet Express', /id="section-express-reglages"/.test(eq) && /put\('eqpanel-express', byId\('section-express-reglages'\)\)/.test(js10) && /'section-express-reglages'/.test(js9));
verifier('les onze réglages : grille, commission, solde minimum, rayon, délai, quatre numéros Mobile Money', ['tarif_base', 'tarif_par_km', 'commission_pct', 'solde_minimum', 'rayon_dispatch_km', 'vitesse_moy_kmh', 'delai_prise_en_charge_min', 'momo_wave', 'momo_orange', 'momo_mtn', 'momo_moov'].every(k => new RegExp("\\['" + k + "'").test(js9)));
verifier('la commission se saisit en %, s\'écrit en fraction', /type === 'pct' \? Number\(raw\) \/ 100/.test(js9));
verifier('sans numéro Mobile Money, le bureau est prévenu (les coursiers ne peuvent pas recharger)', /Aucun numéro Mobile Money/.test(js9));
verifier('le bouton « Commission reçue » a disparu (la commission se règle au serveur à la livraison)', !/btn-mark-commission/.test(js9));
verifier('Actualiser relit Personnes, Retours et Comptes (la clé « clients » n\'existait plus)', /cle === 'personnes'/.test(js9) && /cle === 'retours'/.test(js9) && /cle === 'comptes'/.test(js9) && !/cle === 'clients'/.test(js9));
verifier('le style des réglages : champs de 44 px, variante nuit', /\.rx-champ input\{[^}]*min-height:44px/.test(lire('app/style.css')) && /html\[data-theme="dark"\] \.rx-champ input/.test(lire('app/style.css')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
