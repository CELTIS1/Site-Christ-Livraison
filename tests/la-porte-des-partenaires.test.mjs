/* LA PORTE DES PARTENAIRES — Générale CI (25 septembre 2026, lot U)
   ==========================================================================================
   Celtis : « quand Générale CI a des commandes, qu'elles viennent directement chez nous, sans
   se mélanger avec nos clientes ». Ce banc garde la règle (état du branchement, compteurs,
   adresses, marque) et le branchement (Gestion › Partenaires, marque sur les cartes, base).
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
const ctx = vm.createContext({ window: {} });
vm.runInContext(lire('app/partenaires.js'), ctx);
const R = ctx.window.CLTPartenaires;

console.log('\n1. La règle');
verifier('sans compte relié → « relier son compte » ; sans clé → « créer la clé » ; les deux → branché ; coupé → refusé', R.etat({}).cle === 'compte' && R.etat({ fournisseur_id: 'x' }).cle === 'cle' && R.etat({ fournisseur_id: 'x', cle_api_fin: 'ab12' }).cle === 'pret' && R.etat({ actif: false, fournisseur_id: 'x', cle_api_fin: 'a' }).cle === 'coupe');
const n = R.compter([{ recu_le: '2026-09-25T08:00:00Z' }, { recu_le: '2026-09-25T10:00:00Z' }, { recu_le: '2026-09-20T10:00:00Z' }, { recu_le: '2026-09-01T10:00:00Z' }, { recu_le: null }], '2026-09-25T12:00:00Z');
verifier('compteurs : 2 aujourd\'hui, 3 sur 7 jours, la dernière à 10 h', n.aujourdhui === 2 && n.semaine === 3 && n.derniere === '2026-09-25T10:00:00.000Z', JSON.stringify(n));
const a = R.adresses('https://xkfltqjbmolmdwdafzcx.supabase.co/');
verifier('les deux adresses à donner à leur développeur', a.commande === 'https://xkfltqjbmolmdwdafzcx.supabase.co/rest/v1/rpc/partenaire_recevoir_commande' && a.suivi.endsWith('/rpc/partenaire_suivi'));
verifier('la marque : vide pour un colis ordinaire, « Partenaire · réf. » sinon', R.marque({}) === '' && R.marque({ partenaire_id: 'p', reference_partenaire: 'GCI-889' }) === 'Partenaire · réf. GCI-889');

console.log('\n2. La marque sur toutes les cartes');
const lib = lire('app/lib/communes-et-tarifs.js'), css = lire('app/style.css');
const c2 = vm.createContext({ window: {}, escapeHTML: (s) => String(s).replace(/</g, '&lt;') });
vm.runInContext(lib + ';this.D = colisDestinationHTML;', c2);
verifier('colisDestinationHTML (équipe, livreur, cliente) pose « 🤝 Partenaire · réf. » en tête, rien pour un colis ordinaire', /🤝 Partenaire · réf\. GCI-1<\/span> Cocody — Riviera/.test(c2.D({ partenaire_id: 'p', reference_partenaire: 'GCI-1', commune_destination: 'Cocody', destination: 'Riviera' })) && !/Partenaire/.test(c2.D({ commune_destination: 'Cocody', destination: 'Riviera' })));
verifier('la référence est échappée (pas de HTML venu du partenaire)', !/<b>/.test(c2.D({ partenaire_id: 'p', reference_partenaire: '<b>x', commune_destination: 'Cocody' })));
verifier('CSS : 13 px (règle du livreur), nuit prévue', /\.colis-partenaire \{[^}]*font-size: 13px/.test(css) && /html\[data-theme="dark"\] \.colis-partenaire/.test(css));

console.log('\n3. Gestion › Partenaires');
const g = lire('app/gestion.html'), gjs = lire('app/gestion.js'), e = lire('app/partenaires-ecran.js');
verifier('sous-onglet « Partenaires » dans « Qui me doit quoi », section et scripts', /data-sub="partenaires"/.test(g) && /id="compta-partenaires"/.test(g) && g.indexOf('<script src="partenaires-ecran.js') < g.indexOf('<script src="gestion.js') && /CLTPartenairesEcran\.charger\(\)/.test(gjs));
verifier('réservé à l\'administrateur ; la clé vient de partenaire_nouvelle_cle() et n\'est jamais gardée par la page', /window\.ACCES\.isAdmin/.test(e) && /rpc\('partenaire_nouvelle_cle'/.test(e) && !/localStorage/.test(e) && /ne sera plus jamais affichée/.test(e));
verifier('remplacer une clé demande confirmation (l\'ancienne cesse de marcher)', /Remplacer la clé de/.test(e) && /cesseront?|cessera de marcher/.test(e));
verifier('CSS : cibles ≥ 44 px, nuit prévue', /\.pa-champ select\{ min-height:44px/.test(g) && /#pa-copier\{ min-height:44px/.test(g) && /html\[data-theme="dark"\] \.pa-part/.test(g));

console.log('\n4. La base (si le script est là : il vit dans _sql-prive, que GitHub n\'a pas ; joué en base le 25/09, ok = true)');
const F = path.join(RACINE, '_sql-prive/2026-09-26-la-porte-des-partenaires.sql');
if (fs.existsSync(F)) {
  const sql = fs.readFileSync(F, 'utf8');
  verifier('la clé n\'est gardée que par son empreinte sha256', /cle_api_empreinte = encode\(extensions\.digest\(/.test(sql) && !/cle_api text/.test(sql));
  verifier('une référence reçue deux fois ne fait qu\'un colis', /unique \(partenaire_id, reference\)/.test(sql) && /'deja_recue', true/.test(sql));
  verifier('tarif partenaire : même commune → tarif_meme_commune, sinon la grille, jamais sous le minimum', /if v_cd = v_cr then v_prix := v_part\.tarif_meme_commune;/.test(sql) && /greatest\(coalesce\(v_prix, v_part\.prix_minimum\), v_part\.prix_minimum\)/.test(sql));
  verifier('la grille de la base = la grille de l\'application (196 trajets, mêmes prix)', (() => {
    const c3 = vm.createContext({ window: {} }); vm.runInContext(lib + ';this.C = COMMUNES; this.P = computePrixLivraison;', c3);
    return c3.C.every((x) => c3.C.every((y) => sql.includes(`('${x}','${y}',${c3.P(x, y)})`)));
  })());
  verifier('le colis naît sous LEUR compte, marqué partenaire_id + référence', /v_part\.fournisseur_id,\s*\n\s*left\(coalesce\(nullif\(trim\(p_commande->>'description'\)/.test(sql) && /v_part\.id, v_ref,/.test(sql));
  verifier('seul l\'administrateur crée une clé', /if not public\.is_admin\(\) then raise exception 'reserve_administrateur'/.test(sql) && /revoke all on function public\.partenaire_nouvelle_cle\(uuid\) from public, anon/.test(sql));
}

console.log('\n' + reussies + ' réussie(s), ' + echouees + ' échouée(s).');
process.exit(echouees ? 1 : 0);
