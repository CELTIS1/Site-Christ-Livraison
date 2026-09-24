/* LE POINT A-T-IL ÉTÉ ENVOYÉ À CETTE CLIENTE ? — 18 septembre 2026
   ==========================================================================================
   Celtis : « quand le point est envoyé ou pas, il n'y a aucune méthode pour vérifier que ça a
   été fait ou pas. Quand quelqu'un de l'équipe envoie le point à une cliente, il faut qu'il y
   ait la possibilité de cocher, pour que les autres puissent s'en apercevoir. Sinon on peut
   envoyer plusieurs fois. Différentes personnes peuvent envoyer le même point. Même la même
   personne peut envoyer plusieurs fois en se trompant. »

   Ce banc tient ce qui se lit dans le code, sans base ni navigateur :
     1. la marque se coche À LA MAIN — télécharger un fichier n'est pas l'envoyer ;
     2. elle dit QUI et QUAND, parce que c'est la question de celui qui arrive après ;
     3. elle se voit depuis la liste, sans ouvrir une fiche ;
     4. tant qu'on ne SAIT pas, on n'affirme rien ;
     5. la migration promet ce qu'il faut.
   Les droits, l'unicité et le journal sont éprouvés dans un vrai Postgres
   (tests/point-envoye/essai-en-postgres.py), et les gestes dans un vrai Chromium
   (tests/parcours/le-point-envoye.mjs).

   Lancer à la main :  node tests/le-point-envoye.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const equipe = fs.readdirSync(path.join(APP, 'equipe')).filter(f => f.endsWith('.js')).sort()
  .map(f => fs.readFileSync(path.join(APP, 'equipe', f), 'utf8')).join('\n');
const style = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');

let reussies = 0, echouees = 0, ignorees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}
function ignorer(t, pourquoi){ ignorees++; console.log('  ➖ ' + t + ' — ' + pourquoi); }
function titre(t){ console.log('\n' + t); }
function blocDe(src, nom, fichier){
  const debut = src.search(new RegExp('function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable dans ${fichier}`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  process.exit(1);
}

titre('1. On coche à la main : télécharger n\'est pas envoyer');
{
  const barre = blocDe(equipe, 'brancherReleveBarre', 'equipe');
  verifier('aucune sortie de fichier ne pose la marque toute seule',
    !/marquer_point_envoye/.test(barre), barre.slice(0, 200));
  verifier('les cinq sorties (PDF, Excel, Word, WhatsApp, partage du PDF) mettent seulement le bouton en évidence',
    (barre.match(/releveRappelerDeCocher\(\)/g) || []).length === 5, barre);
  verifier('et c\'est un appui, un seul, qui écrit',
    /marquer\.addEventListener\('click', releveMarquer\)/.test(barre));
  verifier('la raison est écrite là où quelqu\'un la cherchera',
    /Télécharger le PDF n'est pas l'envoyer/.test(equipe));
  verifier('le bouton dit ce qu\'il affirme : « Je viens de l\'envoyer »',
    /✅ Je viens de l’envoyer|✅ Je viens de l'envoyer/.test(equipe));
}

titre('2. La marque dit qui, et quand');
{
  const ctx = vm.createContext({ Date, String, Number, console });
  vm.runInContext(blocDe(equipe, 'recapQuandParQui', 'equipe'), ctx);
  const q = ctx.recapQuandParQui;
  const m = { le: '2026-09-18T19:42:00Z', parNom: 'Awa Koffi' };
  verifier('« à 19 h 42, par Awa Koffi » — l\'heure d\'Abidjan, et le nom',
    q(m) === 'à 19 h 42, par Awa Koffi', q(m));
  verifier('sans le nom (lecture refusée), on donne l\'heure seule plutôt qu\'un nom inventé',
    q({ le: '2026-09-18T19:42:00Z' }) === 'à 19 h 42', q({ le: '2026-09-18T19:42:00Z' }));
  verifier('sans rien, rien', q(null) === '' && q({}) === '');
  verifier('le nom voyage AVEC la marque, par la clé étrangère : l\'écran ne connaît pas les collègues',
    /auteur:envoye_par\(full_name\)/.test(equipe)
    && /parNom: \(l\.auteur && l\.auteur\.full_name\)/.test(equipe));
  verifier('si la jointure est refusée, on redemande sans elle : on perd le nom, pas la marque',
    /const sansNom = await supabaseClient[\s\S]{0,200}\.select\('fournisseur_id, envoye_par, envoye_le'\)/.test(equipe));
}

titre('3. Elle se voit depuis la liste, sans ouvrir une fiche');
{
  verifier('une pastille par vignette', /recap-point--oui/.test(equipe) && /recap-point--non/.test(equipe));
  verifier('« ✅ point envoyé » / « ○ point à envoyer »',
    /✅ point envoyé/.test(equipe) && /○ point à envoyer/.test(equipe));
  verifier('l\'infobulle de la pastille verte redit qui et quand', /title="Point envoyé \$\{escapeHTML\(recapQuandParQui\(m\)\)\}"/.test(equipe));
  verifier('et un compte au-dessus de la liste : combien il en reste',
    /point.{0,40}envoyé.{0,40}sur \$\{clients\.length\}/.test(equipe) && /à faire/.test(equipe));
  verifier('quand tout est fait, il le dit autrement qu\'avec un zéro',
    /Toutes les clientes ont eu leur point/.test(equipe));
  verifier('le gris, pas le rouge : ne pas avoir encore envoyé n\'est pas une faute',
    /\.recap-point--non\{color:#5b6573/.test(style));   // gris assombri le 24/09/2026 (4,1 → 5,2), toujours gris
  verifier('les deux pastilles et le compte ont leur variante sombre',
    /html\[data-theme="dark"\] \.recap-point--oui\{/.test(style)
    && /html\[data-theme="dark"\] \.recap-point--non\{/.test(style)
    && /html\[data-theme="dark"\] \.recap-day-points\{/.test(style));
  verifier('le bouton de la marque fait 44 px, comme tout ce qu\'on touche',
    /\.releve-marque \.btn\{min-height:44px;\}/.test(style));
  verifier('et l\'animation d\'appel se tait pour qui l\'a demandé',
    /prefers-reduced-motion: reduce\)\{ \.releve-marque \.btn\.a-envoyer\{animation:none;\}/.test(style));
}

titre('4. Tant qu\'on ne SAIT pas, on n\'affirme rien');
{
  verifier('la barre n\'offre aucun bouton avant d\'avoir lu les marques',
    /if \(!marques\) return '';/.test(blocDe(equipe, 'releveMarqueHTML', 'equipe')));
  verifier('la liste n\'affiche aucune pastille non plus',
    /const pastille = !marques \? ''/.test(equipe));
  verifier('la raison est écrite : proposer « marquer » sans savoir poserait une seconde marque',
    /Proposer « marquer » sans savoir/.test(equipe));
  verifier('une lecture refusée se note comme « lu, sans réponse » — et non « rien envoyé »',
    /recapPointsEnvoyes\[d\] = undefined;/.test(equipe)
    && /on n'affiche rien/.test(equipe));
  verifier('les marques sont relues quand l\'écran se rafraîchit : quelqu\'un d\'autre a pu cocher',
    /recapChargerPointsEnvoyes\(recapGetDate\(\), true\)/.test(equipe));
}

titre('5. Se dédire est possible, et demandé clairement');
{
  const d = blocDe(equipe, 'releveDemarquer', 'equipe');
  verifier('une confirmation, qui nomme la cliente et le jour', /cltConfirm/.test(d) && /\$\{d\.nom\} — \$\{d\.dateLabel\}/.test(d));
  verifier('elle dit ce que ça change pour l\'équipe', /reverra cette cliente dans celles à faire/.test(d));
  verifier('et que le geste reste au journal', /reste au journal/.test(d));
  verifier('l\'appel passe par la fonction de la base', /rpc\('demarquer_point_envoye'/.test(d));
}

titre('6. La migration promet ce qu\'il faut');
{
  const fichier = path.join(RACINE, '_sql-prive', '2026-09-18-le-point-envoye.sql');
  if (!fs.existsSync(fichier)) {
    ignorer('la migration est lisible', '_sql-prive n\'est pas dans le dépôt public');
  } else {
    const sql = fs.readFileSync(fichier, 'utf8');
    verifier('une marque par cliente et par jour, garantie par la base',
      /unique \(fournisseur_id, jour\)/.test(sql));
    verifier('deux personnes qui cochent en même temps ne font qu\'une marque',
      /on conflict \(fournisseur_id, jour\) do nothing/.test(sql));
    verifier('et c\'est le nom de la première qui reste', /cochant EN PREMIER|coché EN PREMIER|coché en premier/i.test(sql));
    verifier('aucune écriture directe : tout passe par les deux fonctions',
      /Aucune politique d'écriture/.test(sql));
    verifier('ni la cliente ni le livreur ne lisent ces marques',
      /using \(public\.a_acces_operations\(\) or public\.a_acces_compta\(\)\)/.test(sql));
    verifier('les deux gestes s\'écrivent au journal',
      /'point_envoye'/.test(sql) && /'point_envoye_annule'/.test(sql));
    verifier('la migration s\'inscrit au registre',
      /migration_appliquee\('2026-09-18-le-point-envoye\.sql'/.test(sql));
  }
}

console.log(`\n${reussies} réussie${reussies > 1 ? 's' : ''}, ${echouees} échouée${echouees > 1 ? 's' : ''}`
  + (ignorees ? `, ${ignorees} ignorée${ignorees > 1 ? 's' : ''}.` : '.'));
process.exit(echouees ? 1 : 0);
