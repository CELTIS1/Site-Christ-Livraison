/* LES AVIS (26 septembre 2026, lot AV, v284)
   ==========================================================================================
   Celtis : « sur la page de suivi, la photo prend beaucoup de place ; que les gens puissent noter
   et commenter le livreur, et noter et commenter l'entreprise ; sur le site, les premiers
   commentaires en tête, un peu plus grands, puis ceux des gens en dessous, sur une ou deux
   lignes. C'est très important pour la crédibilité. »
   Ce banc charge la vraie règle (app/avis.js) et relit les pages qui l'emploient.
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
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 400) : '')); }
}
const ctx = vm.createContext({ console });
vm.runInContext(lire('app/avis.js'), ctx);
const A = ctx.CLTAvis;

console.log('\n1. La règle (app/avis.js)');
verifier('étoiles : 4 → ★★★★☆ ; 4,6 arrondi à 5 ; rien → ☆☆☆☆☆', A.etoiles(4) === '★★★★☆' && A.etoiles(4.6) === '★★★★★' && A.etoiles(null) === '☆☆☆☆☆');
verifier('moyenne lisible : 4.56 → « 4,6 », rien → « — »', A.moyenneTexte(4.56) === '4,6' && A.moyenneTexte(null) === '—');
const s1 = A.saisie({ noteLivreur: 5, noteClt: 0, commentaireLivreur: '  très   poli ', prenom: 'Awa<script>', accord: 1 });
verifier('saisie : note hors 1-5 ignorée, espaces resserrés, prénom sans balise, accord booléen', s1.ok && s1.saisie.p_note_livreur === 5 && s1.saisie.p_note_clt === null && s1.saisie.p_commentaire_livreur === 'très poli' && s1.saisie.p_prenom === 'Awascript' && s1.saisie.p_accord_publication === true, JSON.stringify(s1));
verifier('saisie sans aucune note : refusée, avec un message clair', !A.saisie({ commentaireClt: 'bien' }).ok && /au moins une note/.test(A.messageErreur('aucune_note')));
verifier('commentaire coupé à 500 signes (comme la base)', A.saisie({ noteClt: 4, commentaireClt: 'x'.repeat(900) }).saisie.p_commentaire_clt.length === 500);
verifier('signature : « Awa · Cocody », sans prénom « Un client · Cocody »', A.signature({ prenom: 'Awa', commune: 'Cocody' }) === 'Awa · Cocody' && A.signature({ commune: 'Cocody' }) === 'Un client · Cocody');
verifier('mois : 2026-09 → « sept. 2026 »', A.moisTexte('2026-09') === 'sept. 2026');
verifier('publiable : jamais sans accord ; jamais sans commentaire', !A.publiable({ accord_publication: false, commentaire_clt: 'ok' }).ok && !A.publiable({ accord_publication: true }).ok && A.publiable({ accord_publication: true, commentaire_livreur: 'top' }).ok);
const avis = [
  { colis_id: 'a', livreur_id: 'L1', livreur_nom: 'Koffi', note_livreur: 5, note_clt: 5, commentaire_livreur: 'top', accord_publication: true, publie: true, maj_le: '2026-09-20' },
  { colis_id: 'b', livreur_id: 'L2', livreur_nom: 'Yao', note_livreur: 2, note_clt: 3, commentaire_livreur: 'en retard', accord_publication: true, maj_le: '2026-09-21' },
  { colis_id: 'c', livreur_id: 'L2', livreur_nom: 'Yao', note_livreur: 3, note_clt: 4, accord_publication: false, maj_le: '2026-09-22' },
  { colis_id: 'd', livreur_id: 'L2', livreur_nom: 'Yao', note_livreur: 3, note_clt: null, commentaire_clt: 'ok', accord_publication: true, maj_le: '2026-09-23' },
];
const b = A.bilan(avis);
verifier('bilan : 4 avis, CLT 4,0, livreurs 3,3, 1 publié, 2 à publier, 1 bas', b.nombre === 4 && b.moyenneClt === 4 && b.moyenneLivreurs === 3.3 && b.publies === 1 && b.aPublier === 2 && b.bas === 1, JSON.stringify(b));
const pl = A.parLivreur(avis);
verifier('par livreur : Yao (3 avis, 2,7, « à suivre ») avant Koffi (1 avis, 5,0)', pl[0].nom === 'Yao' && pl[0].nombre === 3 && pl[0].moyenne === 2.7 && pl[0].aSurveiller && pl[0].bas === 1 && pl[0].dernier === 'en retard' && pl[1].nom === 'Koffi' && !pl[1].aSurveiller, JSON.stringify(pl));
verifier('texte court : coupé au mot, avec « … »', /…$/.test(A.texteCourt('mot '.repeat(80), 50)) && A.texteCourt('court') === 'court');
verifier('moyenne du site : rien sous 5 avis ; dès 5, « 4,6 / 5 … 12 destinataires »', A.phraseMoyenne({ nombre: 4, moyenne: 5 }) === '' && /^4,6 \/ 5 — .*12 destinataires/.test(A.phraseMoyenne({ nombre: 12, moyenne: 4.6 })));

console.log('\n2. La page de suivi');
const suivi = lire('suivi.html');
verifier('les photos en vignettes (84 px), plus en pleine largeur à 360 px de haut', /\.photo-vignette img\{[^}]*width:84px; height:84px/.test(suivi) && !/max-height:360px/.test(suivi) && /\$\{photosHTML\(data\)\}/.test(suivi));
verifier('un toucher agrandit, un toucher ou Échap referme (visionneuse, bouton ✕ de 44 px)', /id="visionneuse"/.test(suivi) && /ouvrirVisionneuse\(b\.dataset\.grand/.test(suivi) && /e\.key === 'Escape'\) fermerVisionneuse/.test(suivi) && /\.visionneuse-fermer\{[^}]*width:44px; height:44px/.test(suivi));
verifier('les lignes resserrées (9 px au lieu de 14)', /padding:9px 0; border-bottom:1px solid #EEF1F5; font-size:14px;/.test(suivi));
verifier('le bloc d\'avis vit HORS de la zone actualisée toutes les 15 s', /<section id="suivi-avis" class="avis" hidden/.test(suivi) && suivi.indexOf('id="suivi-avis"') > suivi.indexOf('id="suivi-result"') && !/resultBox\.innerHTML[^;]*avis-form/.test(suivi));
verifier('seulement pour un colis livré, après les 4 chiffres ; chargé une fois (avisCle)', /data\.statut !== 'livre' \|\| !currentChiffres/.test(suivi) && /if \(cle === avisCle\) return;/.test(suivi) && /rpc\('avis_lire'/.test(suivi));
verifier('deux notes (livreur, CLT) en étoiles de 44 px, deux commentaires, prénom, accord pour le site', /etoilesChamp\('note-livreur'/.test(suivi) && /etoilesChamp\('note-clt'/.test(suivi) && /\.etoile\{[^}]*width:44px; height:44px/.test(suivi) && /id="avis-com-livreur"/.test(suivi) && /id="avis-com-clt"/.test(suivi) && /id="avis-accord"/.test(suivi) && /prénom et commune seulement/.test(suivi));
verifier('envoi par avis_donner avec numéro + chiffres ; un échec garde le texte', /rpc\('avis_donner', Object\.assign\(\{ p_numero: numero, p_chiffres: chiffres \}, s\.saisie\)\)/.test(suivi) && /retourAvis\(A\.messageErreur\(code\), false\);\s*return;/.test(suivi));
verifier('merci, puis « Modifier mon avis » (30 jours)', /Merci pour votre avis/.test(suivi) && /Modifier mon avis/.test(suivi) && /Modifiable jusqu'au/.test(suivi));
verifier('livré : les contacts repliés sous « Une question sur ce colis ? »', /data\.statut === 'livre'\s*\n[^\n]*\n[^\n]*\n\s*\? `<details class="contacts-replies"/.test(suivi));
verifier('le lien ?avis=1 descend jusqu\'au bloc', /has\('avis'\)/.test(suivi) && /zoneAvis\.scrollIntoView/.test(suivi));
verifier('la règle est chargée avant le script de la page', suivi.indexOf('<script src="app/avis.js') > 0 && suivi.indexOf('<script src="app/avis.js') < suivi.indexOf('const zoneAvis'));

console.log('\n3. Le message « livré » invite à donner son avis');
const config = lire('app/config.js');
verifier('« Votre avis sur la livraison compte » + lien ?…&avis=1 ; pas pour une expédition', /i\.statut === "livre" && !i\.expedition/.test(config) && /Votre avis sur la livraison compte \(1 minute\)/.test(config) && /"avis=1"/.test(config));

console.log('\n4. Le site');
const index = lire('index.html');
verifier('les témoignages choisis restent en tête, en plus grand (classe vedette, 16 px)', (index.match(/testimonial-card vedette reveal/g) || []).length >= 5 && /\.testimonial-card\.vedette \.testimonial-text\{font-size:16px/.test(index));
verifier('sur grand écran, deux colonnes (pas de témoignage orphelin)', /@media \(min-width:681px\)\{ \.testimonials-grid\{grid-template-columns:repeat\(2, minmax\(0,1fr\)\)/.test(index));
verifier('sur téléphone, ils glissent un par un au lieu de se serrer à 12 px', /\.testimonial-card\.vedette\{flex:0 0 84%; scroll-snap-align:start/.test(index));
verifier('dessous : la note moyenne et les avis sur deux lignes, six d\'abord', index.indexOf('id="avisSite"') > index.indexOf('id="testimonialsGrid"') && /-webkit-line-clamp:2/.test(index) && /i >= 6 \? ' hidden'/.test(index) && /Voir plus d'avis/.test(index));
verifier('lu par un appel REST direct à site_avis (pas de bibliothèque), caché sans avis', /\/rest\/v1\/rpc\/site_avis'/.test(index) && /if \(phrase \|\| liste\.length\) bloc\.hidden = false;/.test(index) && /id="avisSite" hidden/.test(index));
verifier('tout texte d\'avis passe par escapeHTML', /escapeHTML\(court\)/.test(index) && /escapeHTML\(A\.signature\(a\)\)/.test(index));
verifier('un lien pour donner son avis depuis la page de suivi', /href="suivi\.html">Livré par CLT \? Donnez votre avis/.test(index));

console.log('\n5. Au bureau (Gestion › Site)');
const g = lire('app/gestion.html'), gjs = lire('app/gestion.js'), e = lire('app/avis-ecran.js');
verifier('la carte « ⭐ Avis des clients » en tête de l\'onglet Site', /id="av-carte"/.test(g) && g.indexOf('id="av-carte"') < g.indexOf('Les textes du site'));
verifier('scripts avant gestion.js ; chargés à l\'ouverture de l\'onglet', g.indexOf('<script src="avis-ecran.js') < g.indexOf('<script src="gestion.js') && g.indexOf('<script src="avis.js') < g.indexOf('<script src="avis-ecran.js') && /CLTAvisEcran\.charger\(\)/.test(gjs));
verifier('par livreur, filtres, « Publier sur le site » réservé à l\'admin et aux avis publiables', /A\.parLivreur\(AVIS\)/.test(e) && /data-av-filtre/.test(e) && /estAdmin\(\) \? \(a\.publie/.test(e) && /A\.publiable\(a\)\.ok \? '<button[^']*data-av-publier="1"/.test(e) && /rpc\('avis_publier'/.test(e));
verifier('mode nuit prévu pour la carte', /html\[data-theme="dark"\] \.av-avis/.test(g));

const F = path.join(RACINE, '_sql-prive/2026-09-26-les-avis.sql');
if (fs.existsSync(F)) {
  console.log('\n6. La base (_sql-prive, présent seulement sur le Mac)');
  const sql = fs.readFileSync(F, 'utf8');
  verifier('un avis par colis ; notes 1-5 ; jamais publié sans accord', /colis_id\s+uuid primary key/.test(sql) && /check \(note_livreur between 1 and 5\)/.test(sql) && /check \(not publie or accord_publication\)/.test(sql));
  verifier('la porte : numéro + 4 chiffres, 5 essais par heure (suivi_tentatives)', /coalesce\(v_essais, 0\) >= 5/.test(sql) && /revoke all on function public\.avis__colis_verifie\(text, text\) from public, anon, authenticated/.test(sql));
  verifier('seulement livré, 30 jours ; un avis modifié quitte le site', /v_c\.statut <> 'livre'/.test(sql) && /interval '30 days'/.test(sql) && /then true else false end/.test(sql));
  verifier('publier : admin seul ; bureau : pas pour l\'anonyme ; site_avis : moyenne de tous', /if not public\.is_admin\(\) then raise exception 'reserve_admin'/.test(sql) && /revoke all on function public\.avis_bureau\(date\) from public, anon/.test(sql) && /'moyenne',\s+\(select round\(avg\(coalesce\(note_clt, note_livreur\)\)::numeric, 1\) from public\.avis_colis\)/.test(sql));
  verifier('se note elle-même dans migrations_appliquees', /migration_appliquee\('2026-09-26-les-avis\.sql'/.test(sql));
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
