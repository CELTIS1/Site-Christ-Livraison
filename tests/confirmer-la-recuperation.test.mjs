/* LE LIVREUR CONFIRME CE QU'IL A PRIS — 6 septembre 2026
   ==========================================================================================
   Celtis : « lorsqu'ils partent récupérer, il y a ce qui est annoncé ; il faut qu'ils aient
   la capacité de confirmer si c'est effectivement le nombre de colis annoncé. Il peut arriver
   que les colis soient moins, ou plus. Il faudrait qu'ils ajustent en fonction de ce qu'ils
   récupèrent. »

   Ce que ce banc tient : la phrase « N pris, M annoncés (il en manque …) » est écrite une fois
   dans config.js et lue par les deux écrans ; la ligne de tournée porte ce que le livreur a
   confirmé ; le téléphone écrit par la fonction de la base confirmer_recuperation et jamais par
   un update direct (le livreur n'a pas ce droit) ; le bureau lit les mêmes colonnes ; et le
   script SQL, quand il est sur le poste, ne touche que la ligne du livreur, du jour.

   Lancer à la main :  node tests/confirmer-la-recuperation.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const config = fs.readFileSync(path.join(APP, 'config.js'), 'utf8');
const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');
const equipe = fs.readFileSync(path.join(APP, 'equipe.html'), 'utf8');
const CHEMIN_SQL = path.join(RACINE, '_sql-prive', '2026-09-06-le-livreur-confirme-ce-qu-il-a-pris.sql');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }
function blocDe(src, nom){
  const debut = src.search(new RegExp('function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  process.exit(1);
}

titre('La phrase du nombre pris, la même pour les deux écrans');
{
  const ctx = vm.createContext({});
  vm.runInContext(blocDe(config, 'libelleColisPris'), ctx);
  const phrase = vm.runInContext('libelleColisPris', ctx);
  verifier('rien confirmé → rien à dire', phrase({ nbPris: null, nbAnnonce: 6 }) === '' && phrase({}) === '');
  verifier('autant que prévu', phrase({ nbPris: 6, nbAnnonce: 6 }) === '6 pris, comme annoncé');
  verifier('moins que prévu : on dit combien il en manque', phrase({ nbPris: 4, nbAnnonce: 6 }) === '4 pris, 6 annoncés (il en manque 2)');
  verifier('plus que prévu : on le dit sans en faire un problème', phrase({ nbPris: 7, nbAnnonce: 6 }) === '7 pris, 6 annoncés (1 de plus)');
  verifier("rien n'était annoncé", phrase({ nbPris: 3, nbAnnonce: null }) === "3 pris (rien n'était annoncé)");
  verifier('zéro pris se dit aussi', phrase({ nbPris: 0, nbAnnonce: 2 }) === '0 pris, 2 annoncés (il en manque 2)');
}

titre('La ligne de tournée porte ce que le livreur a confirmé');
{
  const bloc = blocDe(config, 'tourneesDeRecuperation');
  verifier('nbPris, prisConfirmeAt et prisNote sortent de la ligne de programmation',
    /nbPris: \(p\.nb_colis_pris === undefined \|\| p\.nb_colis_pris === null\) \? null : Number\(p\.nb_colis_pris\)/.test(bloc)
    && /prisConfirmeAt: p\.pris_confirme_at \|\| null/.test(bloc) && /prisNote: p\.pris_note \|\| ""/.test(bloc));
}

titre('Le téléphone : un chiffre proposé, un bouton, une seule écriture par la base');
{
  const bloc = blocDe(livreur, 'renderMaTournee');
  verifier('la tournée du livreur lit les trois colonnes', /nb_colis_pris, pris_confirme_at, pris_note/.test(livreur));
  verifier("la confirmation n'est proposée que sur une ligne du programme, une fois parti ou une fois pris",
    /const peutConfirmer = !l\.horsProgramme && l\.id && !l\.rienARecuperer && \(enRoute \|\| l\.nbDejaPris > 0 \|\| l\.ecartAnnonce > 0\)/.test(bloc));
  verifier('le chiffre proposé est ce qu\'on sait déjà, sinon l\'annonce',
    /const propose = \(l\.nbDejaPris \+ l\.nbAPrendre\) \|\| \(l\.nbAnnonce !== null && l\.nbAnnonce !== undefined \? l\.nbAnnonce : 0\)/.test(bloc));
  verifier("le livreur est prévenu de ce qu'elle avait annoncé", /Elle avait annoncé \$\{l\.nbAnnonce\}\. Si c'est moins ou plus, corrigez le chiffre avant de confirmer\./.test(bloc));
  verifier('une fois confirmé, la carte le dit et propose « Corriger »',
    /tournee-geste--corriger" data-tournee-confirmer=/.test(bloc) && /libelleColisPris\(l\)/.test(bloc));
  verifier("l'écriture passe par confirmer_recuperation, jamais par un update de programmations_collecte",
    /rpc\('confirmer_recuperation', \{ p_programmation_id: progId, p_nb_pris: nb, p_note: null \}\)/.test(livreur)
    && !/from\('programmations_collecte'\)\s*\.update/.test(livreur));
  verifier('après confirmation, la tournée est relue', /rpc\('confirmer_recuperation'[\s\S]{0,900}?await chargerMaTournee\(\)/.test(livreur));
  verifier('un chiffre vide ou négatif ne part pas', /if \(!Number\.isFinite\(nb\) \|\| nb < 0\)/.test(livreur));
}

titre('Le bureau lit la même chose, et voit l\'écart en rouge');
{
  verifier('la programmation du bureau lit les trois colonnes', /nb_colis_pris, pris_confirme_at, pris_note/.test(equipe));
  verifier('la carte du bureau affiche la phrase de config.js', /libelleColisPris\(l\)/.test(equipe));
  verifier("l'écart avec l'annonce est signalé", /tournee-pris-confirme--ecart/.test(equipe) && /l\.nbPris !== l\.nbAnnonce/.test(equipe));
  verifier('le bureau ne confirme pas à la place du livreur', !/data-tournee-confirmer/.test(equipe));
}

titre('Le script SQL (quand il est sur le poste)');
if (!fs.existsSync(CHEMIN_SQL)) {
  console.log('  ⏭️  NON VÉRIFIÉ ici : _sql-prive/ n\'est pas publié ; ce contrôle ne tourne que sur le poste de travail.');
} else {
  const sql = fs.readFileSync(CHEMIN_SQL, 'utf8');
  verifier('trois colonnes, rien de plus', /add column if not exists nb_colis_pris/.test(sql) && /pris_confirme_at/.test(sql) && /pris_note/.test(sql));
  verifier('la fonction ne touche que la ligne du livreur connecté', /v_ligne\.livreur_id is distinct from auth\.uid\(\)/.test(sql));
  verifier("et que la tournée du jour (ou de la veille)", /v_ligne\.jour < \(current_date - 1\) or v_ligne\.jour > current_date/.test(sql));
  verifier("la confirmation règle l'annonce", /annonce_reglee_at = coalesce\(pc\.annonce_reglee_at, now\(\)\)/.test(sql));
  verifier('ouverte aux connectés seulement', /grant execute on function public\.confirmer_recuperation\(uuid, integer, text\) to authenticated/.test(sql) && /revoke all on function public\.confirmer_recuperation/.test(sql));
  verifier("elle s'inscrit au registre des migrations", /migration_appliquee\('2026-09-06-le-livreur-confirme-ce-qu-il-a-pris\.sql'/.test(sql));
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
