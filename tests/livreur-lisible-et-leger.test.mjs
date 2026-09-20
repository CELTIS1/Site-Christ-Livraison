/* LE LIVREUR : LISIBLE ET LÉGER — 10 septembre 2026 (feuille de route 2.4 et 2.5)
   ==========================================================================================
   2.4 — tout ce qu'on touche fait 44 px au moins, aucun texte sous 13 px sur l'écran du livreur,
   le gris trop clair (#94a3b8, 2,6:1) a disparu de l'application.
   2.5 — « Ma journée » tient sur une ligne dépliable ; quatre pastilles ; recherche, calendrier
   et sélection derrière un seul bouton « Filtrer », ouvert d'office quand un filtre est actif.

   Lancer à la main :  node tests/livreur-lisible-et-leger.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const livreur = fs.readFileSync(path.join(APP, 'livreur.html'), 'utf8');
const config = ['config.js'].concat(fs.readdirSync(path.join(APP, 'lib')).filter(f => f.endsWith('.js')).sort().map(f => 'lib/' + f)).map(f => fs.readFileSync(path.join(APP, f), 'utf8')).join('\n') /* config.js et ses blocs sortis (4.8) */;
const style = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }
function blocDe(src, nom){
  const debut = src.search(new RegExp('(async\\s+)?function\\s+' + nom + '\\s*\\('));
  if (debut === -1) { console.error(`Fonction ${nom} introuvable`); process.exit(1); }
  let i = src.indexOf('{', debut), prof = 0;
  for (; i < src.length; i++) { if (src[i] === '{') prof++; else if (src[i] === '}') { prof--; if (prof === 0) return src.slice(debut, i + 1); } }
  process.exit(1);
}
// Le code sans ses commentaires : les commentaires racontent volontairement les anciennes valeurs.
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

titre('2.4 · Textes lisibles');
{
  const petits = sansCommentaires(livreur).match(/font-size:\s*(?:[1-9]|1[0-2])(?:\.\d+)?px/g) || [];
  verifier("aucun texte sous 13 px n'est écrit dans livreur.html", petits.length === 0, petits.slice(0, 5).join(', '));
  const gris = [livreur, config, style].map(s => (sansCommentaires(s).match(/#94a3b8/gi) || []).length).reduce((a, b) => a + b, 0);
  verifier('le gris #94a3b8 (2,6:1 de contraste) a disparu de livreur.html, config.js et style.css', gris === 0, gris + ' occurrence(s)');
  verifier('le gris qui le remplace (#6b7686) est bien là', /#6b7686/.test(config) && /#6b7686/.test(livreur));
}

titre('2.4 · Cibles de 44 px');
{
  const bloc = livreur.slice(livreur.indexOf('2.4 · CIBLES DE 44 px'), livreur.indexOf('</style>'));
  const regle = bloc.match(/([^{}]+)\{\s*min-height:44px;\s*\}/);
  const selecteurs = regle ? regle[1] : '';
  ['.status-select', '.filter-chip', '.date-filter-input', '.date-filter-clear', '.btn-sm', '.btn-outline', '.colis-plus > summary', '.clt-toptab', '.clt-actualiser', '.btn-appel', '.btn-notify-wa', '.search-input', '.btn-reporter', '.btn-retenter']
    .forEach(sel => verifier(`${sel} : 44 px au moins`, selecteurs.includes(sel)));
  verifier('les cases à cocher font 24 px', /\.lot-check\{ width:24px; height:24px; \}/.test(bloc));
  verifier('les champs de montant et d\'observation font 44 px et 15 px de texte (pas de zoom forcé sur iPhone)', /\.montant-case input, \.frais-exp-input, \.obs-textarea, \.report-date\{ min-height:44px; font-size:15px; \}/.test(bloc));
  verifier('les pastilles de filtre : 13,5 px, 10 px de marge intérieure', /\.filter-chip\{ display:inline-flex; align-items:center; padding:10px 16px; font-size:13\.5px; \}/.test(bloc));
}

titre('2.5 · Le haut de page');
{
  verifier('« Ma journée » est un repli (<details>) dont la ligne de titre porte les chiffres et l\'argent en main',
    /<details class="card journee-card journee-repli" id="ma-journee-card"/.test(livreur) && /<summary class="journee-resume" id="ma-journee-resume">/.test(livreur) && /id="journee-resume-chiffres"/.test(livreur) && /<span class="journee-resume__main" id="journee-en-main">/.test(livreur));
  const resume = blocDe(livreur, 'renderTourneeSummary');
  /* 17/09/2026, point 9.4 : cette ligne recomptait de son côté et ajoutait en_attente à
     « en cours » — les tuiles disaient « 1 pas encore pris · 1 en cours », elle disait « 2 en
     cours ». Elle ne compte plus : elle lit le même tableau que les tuiles. C'est ce qu'on
     vérifie ici, et le texte lui-même est éprouvé dans tests/le-meme-mot.test.mjs. */
  verifier('la ligne ne recompte plus : elle lit le même tableau que les tuiles (resumeDuJourTexte)',
    /resumeDuJourTexte\(duJour\)/.test(resume) && !/en cours`/.test(resume));
  verifier('elle dit le jour quand ce n\'est pas aujourd\'hui', /jour !== todayLocalISODate\(\) \? jourEnClairCourt\(jour\)/.test(resume));
  verifier('l\'argent en main est dans la ligne (« 💵 12 500 FCFA en main »)', /en main`\)/.test(blocDe(livreur, 'renderEnMainLigne')));
  verifier('le repli se souvient de son état sur l\'appareil', /clt:livreur:journee-ouverte/.test(livreur));
  // Les pastilles
  const ctx = vm.createContext({});
  vm.runInContext("const FILTRE_A_FAIRE = 'a_faire'; const FILTRE_A_RENDRE = 'a_rendre'; const FILTER_LABELS = { tous: 'Tous', livre: 'Livrés', non_livre: 'Non livrés', en_attente: 'x', recupere: 'y', en_livraison: 'z', retour: 'r' };\n" + livreur.match(/const FILTER_LABELS_MES = [^\n]+/)[0], ctx);
  const cles = Object.keys(vm.runInContext('FILTER_LABELS_MES', ctx));
  // 20/09/2026 (20.C) : « À rendre » s'ajoute — les retours encore dans le sac, avec leur nombre.
  verifier('cinq pastilles, dans cet ordre : Ma journée, Livrés, Non livrés, À rendre, Tous', cles.join(',') === 'a_faire,livre,non_livre,a_rendre,tous', cles.join(','));
  verifier('« À rendre » porte le nombre de retours dans le sac et ignore le calendrier', /filter-chip-nb/.test(blocDe(livreur, 'renderFilters')) && /activeFilterMes === FILTRE_A_RENDRE \? colisARendre\(mine\)/.test(livreur));
  const filtres = blocDe(livreur, 'renderFilters');
  verifier('un bouton « 🔍 Filtrer » ferme la rangée, marqué quand une recherche ou une date est active', /id="btn-filtrer-mes"/.test(filtres) && /filtreActif \? ' a-un-filtre' : ''/.test(filtres) && /const filtreActif = !!\(searchMes \|\| filtreDateMes\)/.test(filtres));
  verifier('la recherche, le calendrier et la sélection sont dans un bloc replié par défaut', /<div id="mes-filtres-avances" class="mes-filtres-avances hidden">/.test(livreur) && livreur.indexOf('id="mes-filtres-avances"') < livreur.indexOf('id="search-mes"') && livreur.indexOf('id="search-mes"') < livreur.indexOf('id="btn-mode-lot-mes"'));
  verifier('le bloc reste ouvert tant qu\'un filtre est actif', /bloc\.classList\.toggle\('hidden', !\(mesFiltresOuverts \|\| searchMes \|\| filtreDateMes\)\)/.test(blocDe(livreur, 'appliquerFiltresAvances')));
  verifier('la rangée se redessine quand la recherche ou la date change (le marqueur suit)', (livreur.match(/renderFilters\('filters-mes', activeFilterMes, selectFilterMes\)/g) || []).length >= 5);
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
