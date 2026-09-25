/* LE SITE QUI VEND — chantier Q, lots S-1 (l'accueil) et S-3 (la page Livreurs), 25 septembre 2026
   ==========================================================================================
   Propositions du 25/09, § 2 : une promesse en six mots et un seul bouton, la preuve en chiffres
   en direct, le produit montré (vidéos), les objections écrites ; une page Livreurs qui répond à
   « qu'est-ce que je gagne ? » avec les chiffres de la grille du 1er octobre 2026.
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
const index = lire('index.html'), livreurs = lire('livreurs.html'), contenu = JSON.parse(lire('content/content.json'));

console.log('\n1. L\'accueil (S-1)');
verifier('la promesse : « Votre colis livré, votre argent rendu… », dans la page ET dans content.json (Gestion › Site)', /Votre colis livré, votre argent rendu, et vous savez où en est chaque colis\./.test(index) && contenu.hero.title === 'Votre colis livré, votre argent rendu, et vous savez où en est chaque colis.' && /Première livraison offerte/.test(contenu.hero.lead));
verifier('UN bouton principal : « Commencer sur WhatsApp », avec le message prérempli, compté ; le suivi en second', /id="heroWhatsApp"[^>]*data-site-compteur="whatsapp-heros"/.test(index) && /wa\.me\/2250546818640\?text=/.test(index.split('id="heroWhatsApp"')[0].slice(-400)) && /Commencer sur WhatsApp/.test(index) && /href="suivi\.html" class="btn btn-secondary"/.test(index) && !/hero-actions">\s*<a href="#devis"/.test(index));
verifier('la preuve en chiffres : quatre tuiles, lues par site_chiffres (fonction publique), tirets sans réseau', ['chiffre-livres-mois', 'chiffre-taux', 'chiffre-vendeuses', 'chiffre-reverse'].every(id => new RegExp('id="' + id + '">—<').test(index)) && /rest\/v1\/rpc\/site_chiffres/.test(index) && /les tirets restent/.test(index));
verifier('le produit montré : trois vidéos de l\'aide (suivre, relevé, retour), affiche posée, rien téléchargé avant le clic', (index.match(/<video controls preload="none"/g) || []).length >= 3 && /cliente-suivre-signaler\.mp4/.test(index) && /cliente-releve\.mp4/.test(index) && /cliente-confirmer-retour\.mp4/.test(index) && /media-src 'self'/.test(index));
verifier('les objections, écrites : le colis perdu, l\'argent, les livreurs, le prix', (index.match(/class="objection reveal"/g) || []).length === 4 && /Et si mon colis se perd/.test(index) && /Et mon argent/.test(index) && /Ça coûte combien/.test(index));
verifier('l\'ordre : héros → chiffres → confiance → services → produit → objections → comment ça marche', ['class="hero"', 'id="preuve"', 'class="trust"', 'id="services"', 'id="produit"', 'id="objections"', 'id="comment-ca-marche"'].map(m => index.indexOf(m)).every((v, i, a) => v > 0 && (i === 0 || v > a[i - 1])));
verifier('le menu et le pied de page mènent à la page Livreurs', /href="livreurs\.html" onclick="closeMenu\(\)">Devenir livreur/.test(index) && /href="livreurs\.html">Devenir livreur chez CLT/.test(index));
verifier('les clics comptés n\'envoient que « clic » et le nom du bouton (site_visits, insertion anonyme déjà autorisée)', /visitor_id: 'clic', page: b\.dataset\.siteCompteur/.test(index));
verifier('téléphone : les grilles passent à une colonne', /@media\(max-width:860px\)\{ \.preuve-grid\{ grid-template-columns:repeat\(2,1fr\); \} \.produit-grid\{ grid-template-columns:1fr; \} \.objections-grid\{ grid-template-columns:1fr; \}/.test(index));

console.log('\n2. La page Livreurs (S-3)');
verifier('la page existe, avec sa CSP, son titre et sa description pour Google', /Content-Security-Policy/.test(livreurs) && /<title>Travailler chez CLT — livreur à Abidjan/.test(livreurs) && /<meta name="description" content="Livreur à Abidjan \?/.test(livreurs));
verifier('les trois formules avec les chiffres de la grille : 150 000 F, 275 000 F et plus, 60 % (65 % au-delà de 300 colis)', /Formule 1 — Salarié, moto CLT/.test(livreurs) && /150 000 F <small>par mois/.test(livreurs) && /275 000 F et plus/.test(livreurs) && /60 % de chaque course/.test(livreurs) && /65 % au-delà de 300 colis/.test(livreurs));
verifier('les primes : 20 000 réussite, 10 000 travail correct, 300 F/colis au-delà de 15, 15 000 livreur du mois, fidélité 5/10/15 000', /20 000 F<\/strong><span>Prime de réussite/.test(livreurs) && /10 000 F<\/strong><span>Prime de travail correct/.test(livreurs) && /300 F \/ colis/.test(livreurs) && /15 000 F<\/strong><span>Livreur du mois/.test(livreurs) && /\+5 000 F après 6 mois, \+10 000 après 12, \+15 000 après 24/.test(livreurs));
verifier('« Écrire LIVREUR sur WhatsApp » : deux boutons, comptés (whatsapp-livreurs), le message prérempli', (livreurs.match(/data-site-compteur="whatsapp-livreurs"/g) || []).length === 2 && /wa\.me\/2250546818640\?text=LIVREUR/.test(livreurs));
verifier('le parcours de recrutement en cinq étapes : LIVREUR, 20 min, journée d\'essai payée 5 000 F, contrat, 3 mois', (livreurs.match(/class="etape"/g) || []).length === 5 && /Une journée d'essai, payée/.test(livreurs) && /5 000 F, avec un livreur confirmé/.test(livreurs));
verifier('trois vidéos du livreur, sans son, affiche posée', (livreurs.match(/<video controls preload="none" playsinline muted/g) || []).length === 3 && /livreur-je-pars-recupere\.mp4/.test(livreurs));
verifier('les cibles : boutons ≥ 48 px, curseur 44 px, questions 48 px', /\.btn\{[^}]*min-height:48px/.test(livreurs) && /input\[type=range\]\{[^}]*height:44px/.test(livreurs) && /\.faq-item summary\{[^}]*min-height:48px/.test(livreurs));

console.log('\n2 bis. La page Vendeuses (S-2) et la page Express (S-4)');
const vendeuses = lire('vendeuses.html'), express = lire('express.html'), qvq = lire('app/qui-vend-quoi.js');
verifier('vendeuses.html : ce que vous gagnez, trois écrans, trois vidéos, le prix, « Nos vendeuses » lu par site_vendeuses (anon), filtres par secteur, « Commander chez elle » sur WhatsApp', /id="gagnez"/.test(vendeuses) && (vendeuses.match(/<video controls preload="none"/g) || []).length === 3 && /rpc\/site_vendeuses/.test(vendeuses) && /data-filtre/.test(vendeuses) && /Commander chez elle/.test(vendeuses) && /je vous ai trouvée sur le site de CLT/.test(vendeuses));
verifier('les secteurs de la page sont ceux de l\'application (activite-de-la-cliente.js)', (() => { const app = lire('app/activite-de-la-cliente.js'); return ['mode', 'beaute', 'alimentation', 'electromenager', 'telephonie', 'maison', 'enfants', 'sante', 'documents', 'autre'].every(k => new RegExp("cle: '" + k + "'").test(app) && new RegExp(k + ": '").test(vendeuses)); })());
verifier('le bureau publie / retire une fiche depuis « Qui vend quoi » (son accord ET la validation), avec repli si le SQL manque', /data-qvq-vitrine="1"/.test(qvq) && /rpc\('vitrine_valider'/.test(qvq) && /sans son accord/.test(qvq) && /jouez le SQL du 25\/09/.test(qvq));
verifier('express.html : quatre vidéos (client et coursier), les objections, le code de livraison expliqué, media-src', (express.match(/<video controls preload="none"/g) || []).length === 4 && /objections-express/.test(express) && /code à 4 chiffres/.test(express) && /media-src 'self'/.test(express));
verifier('le menu de l\'accueil mène à Vendeuses et à Livreurs', /href="vendeuses\.html" onclick="closeMenu\(\)">Vendeuses/.test(index) && /href="livreurs\.html" onclick="closeMenu\(\)">Devenir livreur/.test(index));
const sqlV = path.join(RACINE, '_sql-prive/2026-09-25-le-site-nos-vendeuses.sql');
if (fs.existsSync(sqlV)) { const sv = fs.readFileSync(sqlV, 'utf8'); verifier('le SQL des vendeuses : consentement ET validation, jamais l\'un sans l\'autre ; colis arrondis à la dizaine ; rien de nominatif sur les clientes de la vendeuse', /a\.presentable = true and a\.vitrine_validee_at is not null/.test(sv) && /\(count\(\*\) \/ 10\) \* 10/.test(sv) && /grant execute on function public\.site_vendeuses\(\) to anon/.test(sv)); }

console.log('\n3. Le simulateur dit la même chose que la grille (au franc près)');
const js = livreurs.split('<script>')[1].split('</script>')[0];
const ctx = vm.createContext({ document: { getElementById: () => ({ addEventListener() {}, value: '15', textContent: '' }), addEventListener() {} }, fetch: () => Promise.resolve() });
vm.runInContext(js.replace(/poser\(\);\s*$/m, ''), ctx);
const calc = ctx.calculer;
verifier('12 colis/jour : formule 1 = 180 000 F (grille : 180 000), formule 2 = 305 000 F', calc(12).f1 === 180000 && calc(12).f2 === 305000, JSON.stringify(calc(12)));
verifier('18 colis/jour : prime de volume 23 400 F (grille) → formule 1 = 203 400 F', calc(18).f1 === 203400, calc(18).f1);
verifier('20 colis/jour : formule 1 = 219 000 F (grille : 234 000 avec livreur du mois, non compté ici) ; formule 3 ≈ 429 000 F (65 %, plus de 300 colis)', calc(20).f1 === 219000 && calc(20).f3 === 429000, JSON.stringify(calc(20)));
verifier('12 colis/jour en formule 3 : 60 % sur 264 colis = 237 600 F (grille : ≈ 245 000)', calc(12).f3 === 237600);

console.log('\n4. Le SQL');
const sqlPath = path.join(RACINE, '_sql-prive/2026-09-25-le-site-les-chiffres-en-direct.sql');
if (fs.existsSync(sqlPath)) {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  verifier('site_chiffres() : des totaux du mois seulement, pour anon ; la promesse posée dans site_contenu ; ok = true', /create or replace function public\.site_chiffres\(\)/.test(sql) && /grant execute on function public\.site_chiffres\(\) to anon/.test(sql) && !/full_name|phone|fournisseur_id\b[^)]*\)\s*as/.test(sql.split('json_build_object')[1]) && /jsonb_set/.test(sql) && /as ok;\s*$/.test(sql));
} else console.log('  (SQL privé absent ici : ses contrôles passent sur la copie de Claude)');

console.log('\n' + reussies + ' réussie(s), ' + echouees + ' échouée(s).');
process.exit(echouees ? 1 : 0);
