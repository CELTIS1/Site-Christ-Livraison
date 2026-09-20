/* LE GUIDE DU GÉRANT (20/09/2026) — Gestion › Guide, administrateur seul.
   Celtis : « des résumés brefs et clairs, concis, pour que je puisse vraiment les comprendre et
   les utiliser ». Ce banc tient donc LA FORME des fiches (une fiche se lit en vingt secondes),
   fait tourner le filtre, et vérifie que « Y aller » ne mène que là où un écran existe.
   Lancer à la main :  node tests/le-guide-du-gerant.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 400) : '')); } }

const guide = JSON.parse(lire('app/guide-du-gerant.json'));
const F = guide.fiches, cles = guide.espaces.map((e) => e[0]);
const gestion = lire('app/gestion.html'), gestionJs = lire('app/gestion.js'), source = lire('app/guide-du-gerant.js');

console.log('\n1. La forme des fiches');
verifier('au moins trente fiches, et une date de mise à jour', F.length >= 30 && /\d{4}$/.test(guide.maj), F.length);
verifier('chaque fiche a un identifiant unique, en minuscules et tirets', new Set(F.map((f) => f.id)).size === F.length && F.every((f) => /^[a-z0-9-]+$/.test(f.id)));
verifier('chaque fiche est rangée dans un espace connu, et chaque espace annoncé a au moins une fiche', F.every((f) => cles.includes(f.espace)) && cles.every((c) => F.some((f) => f.espace === c)), F.filter((f) => !cles.includes(f.espace)).map((f) => f.id));
verifier('titre ≤ 60 caractères', F.every((f) => f.titre && f.titre.length <= 60), F.filter((f) => !f.titre || f.titre.length > 60).map((f) => f.id));
verifier('« en bref » : UNE idée, ≤ 140 caractères', F.every((f) => f.enBref && f.enBref.length <= 140), F.filter((f) => !f.enBref || f.enBref.length > 140).map((f) => [f.id, (f.enBref || '').length]));
verifier('« où » est toujours dit', F.every((f) => f.ou && f.ou.length >= 8 && f.ou.length <= 140), F.filter((f) => !f.ou || f.ou.length > 140).map((f) => f.id));
verifier('de 2 à 4 étapes, chacune ≤ 180 caractères', F.every((f) => Array.isArray(f.etapes) && f.etapes.length >= 2 && f.etapes.length <= 4 && f.etapes.every((e) => e.length <= 180)), F.filter((f) => !(f.etapes.length >= 2 && f.etapes.length <= 4 && f.etapes.every((e) => e.length <= 180))).map((f) => f.id));
verifier('« à savoir » et « ce qui vous revient » restent courts (≤ 300)', F.every((f) => (f.aSavoir || '').length <= 300 && (f.pourVous || '').length <= 300), F.filter((f) => (f.aSavoir || '').length > 300 || (f.pourVous || '').length > 300).map((f) => f.id));
verifier('pas de jargon de développeur dans ce que lit le gérant (commit, bundle, RLS, regex, DOM…)', F.every((f) => !/\b(commit|bundle|RLS|regex|DOM|JavaScript|CSS|fetch|API)\b/.test([f.titre, f.enBref, f.etapes.join(' '), f.aSavoir || '', f.pourVous || ''].join(' '))), F.filter((f) => /\b(commit|bundle|RLS|regex|DOM|JavaScript|CSS|fetch|API)\b/.test([f.titre, f.enBref, f.etapes.join(' '), f.aSavoir || '', f.pourVous || ''].join(' '))).map((f) => f.id));

console.log('\n2. « Y aller » ne mène que là où un écran existe');
const onglets = [...gestion.matchAll(/class="tab[^"]*" id="tab-[a-z]+" data-tab="([a-z]+)"/g)].map((m) => m[1]);
verifier('un onglet de Gestion cité existe, une ancre citée existe dans la page', F.filter((f) => f.aller && f.aller.tab).every((f) => onglets.includes(f.aller.tab) && (!f.aller.ancre || gestion.includes('id="' + f.aller.ancre + '"'))), F.filter((f) => f.aller && f.aller.tab && !(onglets.includes(f.aller.tab) && (!f.aller.ancre || gestion.includes('id="' + f.aller.ancre + '"')))).map((f) => f.id));
verifier('une page citée existe dans app/', F.filter((f) => f.aller && f.aller.page).every((f) => fs.existsSync(path.join(RACINE, 'app', f.aller.page))));

console.log('\n3. Le filtre, exécuté');
const w = {}; vm.runInNewContext(source, { window: w, Object, String });
const G = w.CLTGuideDuGerant;
const k = G.compter(F, guide.espaces);
verifier('le compte par espace fait le total', k.espaces.reduce((s, e) => s + e.nb, 0) === k.total && k.total === F.length);
verifier('« Ce qui vous attend » ne garde que les fiches où un geste revient à Celtis', G.filtrer(F, { pourVous: true }).length === k.pourVous && k.pourVous >= 1 && G.filtrer(F, { pourVous: true }).every((f) => f.pourVous));
verifier('la recherche ignore accents et majuscules, et lit aussi les étapes', G.filtrer(F, { recherche: 'ETIQUETTE' }).length >= 2 && G.filtrer(F, { recherche: 'whatsapp' }).some((f) => f.id === 'point-whatsapp') && G.filtrer(F, { recherche: 'zzzz' }).length === 0);
verifier('espace + recherche se combinent', G.filtrer(F, { espace: 'gestion', recherche: 'semaine' }).every((f) => f.espace === 'gestion') && G.filtrer(F, { espace: 'gestion', recherche: 'semaine' }).length >= 1);

console.log('\n4. Le branchement');
const nu = source.replace(/\/\*[\s\S]*?\*\//g, '');
verifier('l\'onglet est caché par défaut et montré à l\'administrateur seul', /id="tab-guide"[^>]*style="display:none;"/.test(gestion) && /setDisp\('tab-guide',\s+isAdmin\)/.test(gestionJs));
verifier('la section existe, avec sa recherche et ses pastilles', /<div class="section" id="sec-guide">/.test(gestion) && /id="gdg-recherche"/.test(gestion) && /id="gdg-pastilles"/.test(gestion) && /id="gdg-corps"/.test(gestion));
verifier('il ne lit rien en base et n\'écrit rien : un fichier, c\'est tout', !/supabaseClient|\.from\(|\.rpc\(/.test(nu) && /guide-du-gerant\.json/.test(nu));
verifier('il passe par les portes de la page (switchTab / switchSub), sans les remplacer', /origine\.apply\(this, arguments\)/.test(nu) && /window\.switchSub\(f\.aller\.tab, f\.aller\.sub\)/.test(nu));
verifier('chargé avant la barre latérale (qui enveloppe switchTab à son tour)', gestion.indexOf('guide-du-gerant.js?v=') > 0 && gestion.indexOf('guide-du-gerant.js?v=') < gestion.indexOf('gestion-barre-laterale.js?v='));
verifier('cibles de 44 px et mode nuit', /\.gdg-pastille\{[^}]*min-height:44px/.test(gestion) && /\.gdg-recherche\{[^}]*height:44px/.test(gestion) && /html\[data-theme="dark"\] \.gdg-fiche\{/.test(gestion));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
