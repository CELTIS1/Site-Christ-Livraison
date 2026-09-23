/* L'ACTIVITÉ DE LA CLIENTE (23/09/2026) — Celtis : « il faudrait que les clientes renseignent le type
   d'activité qu'elles font ; on saura quel vendeur vend quel produit ; ça nous permettra de faire la
   publicité, d'orienter, d'interconnecter ». Règle app/activite-de-la-cliente.js, écran partagé
   app/activite-ecran.js (cliente + bureau), boîte Gestion app/qui-vend-quoi.js, table activites_clientes.
   Lancer à la main :  node tests/l-activite-de-la-cliente.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + String(d).slice(0, 300) : '')); } }

const w = {}; vm.runInNewContext(lire('app/activite-de-la-cliente.js'), { window: w, Object, String, Array, Set, Math, RegExp });
const A = w.CLTActivite;

console.log('\n1. La règle : cinq champs, rien d\'obligatoire, tout ce qui est rempli est juste');
verifier('dix secteurs fermés, sept canaux, « autre » en dernier', A.SECTEURS.length === 10 && A.CANAUX.length === 7 && A.SECTEURS[A.SECTEURS.length - 1].cle === 'autre');
const n1 = A.normaliser({ secteur: 'mode', produits: '  robes   wax, sacs ', canaux: ['whatsapp', 'instagram', 'whatsapp'], lien: 'instagram.com/maboutique', presentable: 'true' });
verifier('espaces repliés, canaux dédoublonnés, https ajouté, accord lu', !n1.erreurs.length && n1.valeurs.produits === 'robes wax, sacs' && n1.valeurs.canaux.length === 2 && n1.valeurs.lien === 'https://instagram.com/maboutique' && n1.valeurs.presentable === true, n1);
const n2 = A.normaliser({ secteur: 'voitures', canaux: ['pigeon'], lien: 'pas un lien' });
verifier('secteur inconnu, canal inconnu, faux lien : trois erreurs, rien n\'est enregistré tel quel', n2.erreurs.length === 3, n2.erreurs);
verifier('une fiche vide est dite vide (la cliente efface son activité)', A.normaliser({}).vide === true && A.normaliser({}).erreurs.length === 0);
verifier('les produits sont coupés à ' + A.PRODUITS_MAX + ' caractères', A.normaliser({ produits: 'x'.repeat(500) }).valeurs.produits.length === A.PRODUITS_MAX);
verifier('le résumé, la même ligne partout', A.resume(n1.valeurs) === 'Mode et vêtements · robes wax, sacs · WhatsApp, Instagram');
verifier('sans accord, presentable est faux — jamais « vrai par défaut »', A.normaliser({ secteur: 'mode' }).valeurs.presentable === false);

console.log('\n2. La mine d\'informations : par secteur, par canal, présentables');
const lignes = [
  { profile_id: 'a', secteur: 'mode', produits: 'robes', canaux: ['whatsapp', 'instagram'], presentable: true },
  { profile_id: 'b', secteur: 'mode', produits: 'sacs', canaux: ['whatsapp'], presentable: false },
  { profile_id: 'c', secteur: 'beaute', produits: '', canaux: ['tiktok'], presentable: true },
  { profile_id: 'd', secteur: null, produits: 'divers', canaux: [], presentable: false },
  { profile_id: 'e', secteur: null, produits: null, canaux: [], presentable: false },   // fiche vide
];
const st = A.statistiques(lignes, 9);
verifier('9 clientes, 4 fiches remplies (la vide ne compte pas), 2 présentables', st.total === 9 && st.remplies === 4 && st.presentables === 2, st);
verifier('mode en tête (2), beauté (1) ; WhatsApp en tête (2)', st.parSecteur[0].cle === 'mode' && st.parSecteur[0].nombre === 2 && st.parCanal[0].cle === 'whatsapp' && st.parCanal[0].nombre === 2);
verifier('une fiche sans secteur est comptée à part, pas cachée', st.sansSecteur === 1);
verifier('la phrase dit tout ça en français', /4 clientes sur 9/.test(A.phrase(st)) && /mode et vêtements \(2\)/.test(A.phrase(st)) && /via WhatsApp/.test(A.phrase(st)) && /2 acceptent/.test(A.phrase(st)), A.phrase(st));
verifier('aucune fiche : la phrase le dit sans chiffre trompeur', /Aucune des 3 clientes/.test(A.phrase(A.statistiques([], 3))));
const pres = A.presentables(lignes, (id) => ({ a: 'Awa', c: 'Chantal' }[id] || '?'));
verifier('les présentables, pour la communication : nom, secteur, produits, canaux — les autres jamais', pres.length === 2 && pres.every((p) => ['Awa', 'Chantal'].includes(p.nom)) && pres[0].secteur === 'Beauté et cosmétiques');

console.log('\n3. La cliente : Mon compte › Mon activité');
const f = lire('app/fournisseur.html');
verifier('le bloc est dans Mon compte, après le nom et avant le téléphone', f.indexOf('id="form-activite"') > f.indexOf('id="form-profile-info"') && f.indexOf('id="form-activite"') < f.indexOf('id="phone-change-msg"'));
verifier('cinq champs marqués data-act, dont l\'accord', ['secteur', 'produits', 'canaux', 'lien', 'presentable'].every((k) => f.includes(`data-act="${k}"`)));
verifier('la case dit clairement que sans elle rien n\'est publié', /Sans cette case, rien n'est publié/.test(f));
verifier('la règle puis l\'écran sont chargés après config.js, et le formulaire est branché sur SON compte', f.indexOf('activite-de-la-cliente.js?v=') > f.indexOf('config.js?v=') && f.indexOf('activite-ecran.js?v=') > f.indexOf('activite-de-la-cliente.js?v=') && /CLTActiviteEcran\.brancher\(document\.getElementById\('form-activite'\), profile\.id/.test(f));

console.log('\n4. L\'écran partagé : même formulaire, upsert sur sa ligne, erreurs de la règle avant la base');
const e = lire('app/activite-ecran.js');
verifier('lit et écrit activites_clientes par profile_id (upsert)', /from\('activites_clientes'\)\.upsert\(/.test(e) && /onConflict: 'profile_id'/.test(e) && /\.eq\('profile_id', profileId\)\.maybeSingle\(\)/.test(e));
verifier('la règle normalise avant d\'écrire ; une erreur arrête tout', /const n = A\(\)\.normaliser\(lireFormulaire\(form\)\)/.test(e) && /if \(n\.erreurs\.length\)/.test(e));
verifier('le formulaire ne se branche qu\'une fois (le bureau le rouvre pour chaque cliente)', /form\.dataset\.actBranche !== '1'/.test(e) && /form\.dataset\.actProfile = profileId/.test(e));
verifier('le texte affiché est échappé', /esc\(A\(\)\.resume\(n\.valeurs\)\)/.test(e));

console.log('\n5. Le bureau : la fiche du compte, et la ligne sous le nom');
const q = lire('app/equipe.html'), l = lire('app/equipe/05-liste-et-comptes.js');
verifier('le bloc « Son activité » est dans « Corriger la fiche », hors du formulaire du nom (pas de formulaire imbriqué)', q.indexOf('id="fiche-activite-box"') > q.indexOf('id="fiche-modal-save"') && q.indexOf('id="fiche-activite-box"') > q.indexOf('</form>', q.indexOf('id="fiche-modal-form"')));
verifier('visible pour une cliente seulement, branché à l\'ouverture', /actBox\.classList\.toggle\('hidden', a\.role !== 'fournisseur'\)/.test(l) && /CLTActiviteEcran\.brancher\(document\.getElementById\('fiche-activite'\), a\.id/.test(l));
verifier('la liste des comptes lit toutes les fiches d\'un coup et montre le résumé sous le nom', /await chargerActivites\(\);/.test(l) && /activiteLigneHTML\(a\.id\)/.test(l) && /escapeHTML\(r\)/.test(l));
verifier('la case de l\'accord, côté bureau, dit de ne cocher que si elle l\'a dit', /à cocher seulement si elle l'a dit/.test(q));
verifier('les scripts sont chargés dans l\'espace équipe', q.indexOf('activite-ecran.js?v=') > q.indexOf('config.js?v='));

console.log('\n6. Gestion : « Qui vend quoi »');
const g = lire('app/gestion.html'), gj = lire('app/gestion.js'), qvq = lire('app/qui-vend-quoi.js');
verifier('la boîte est posée après « Pourquoi ça échoue », les scripts après la règle des causes', g.indexOf('id="cdd-qui-vend-quoi"') > g.indexOf('id="cdd-causes"') && g.indexOf('qui-vend-quoi.js?v=') > g.indexOf('activite-de-la-cliente.js?v='));
verifier('chargée à chaque rendu du tableau de bord', /if \(window\.CLTQuiVendQuoi\) CLTQuiVendQuoi\.charger\(\);/.test(gj));
verifier('deux lectures, pas plus : les fiches et les comptes clientes', (qvq.match(/supabaseClient\.from\(/g) || []).length === 2 && /\.eq\('role', 'fournisseur'\)/.test(qvq));
verifier('trois vues : secteur, canal, liste ; la liste montre le lien et l\'accord', /'secteur' \| 'canal' \| 'liste'/.test(qvq) && /rel="noopener"/.test(qvq) && /Présentable/.test(qvq));
verifier('si la table manque, la boîte le dit au lieu de casser le tableau de bord', /la table des activités manque/.test(qvq));
verifier('la nuit : phrase et « oui » lisibles', /html\[data-theme="dark"\] \.qvq-oui/.test(g) && /html\[data-theme="dark"\] \.cdc-phrase/.test(g));

console.log('\n7. La base : une ligne par cliente, chacune la sienne, le bureau toutes, jamais anon');
const MIG = path.join(RACINE, '_sql-prive', '2026-09-23-activite-des-clientes.sql');
if (fs.existsSync(MIG)) {
  const m = fs.readFileSync(MIG, 'utf8');
  verifier('table activites_clientes, clé = le compte, secteur contraint à la liste, produits ≤ 140', /create table if not exists public\.activites_clientes/.test(m) && /profile_id\s+uuid primary key references public\.profiles\(id\) on delete cascade/.test(m) && /char_length\(produits\) <= 140/.test(m));
  const cles = A.SECTEURS.map((s) => `'${s.cle}'`);
  verifier('les secteurs de la base sont ceux de la règle, ni plus ni moins', cles.every((c) => m.includes(c)) && (m.match(/'[a-z]+'/g) || []).filter((x) => /^'(mode|beaute|alimentation|electromenager|telephonie|maison|enfants|sante|documents|autre)'$/.test(x)).length === 10);
  verifier('RLS : sa ligne, ou accès opérations, ou administrateur ; anon exclu ; pas de suppression', /enable row level security/.test(m) && /revoke all on public\.activites_clientes from anon/.test(m) && /profile_id = auth\.uid\(\) or public\.a_acces_operations\(\) or public\.est_admin\(\)/.test(m) && !/for delete/.test(m));
  verifier('maj_le et maj_par tenus par un déclencheur, pas par l\'écran', /create trigger activites_clientes_maj before insert or update/.test(m) && /new\.maj_par := auth\.uid\(\)/.test(m));
  verifier('une ligne « À faire par le gérant » : demander aux clientes de remplir', /insert into public\.gestion_a_faire/.test(m) && /'activite-clientes-lot1'/.test(m) && /on conflict \(cle\) do nothing/.test(m));
} else {
  console.log('  (migration privée absente de cette copie : banc de la base sauté)');
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
