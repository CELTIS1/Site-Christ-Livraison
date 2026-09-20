// ESLint minimal — 16 septembre 2026 (feuille de route 4.9).
// Pas de style, pas d'avis : seulement ce qui est un bug à coup sûr — une fonction ou une
// variable déclarée deux fois dans le même fichier (c'est ainsi qu'escapeHTML et avatarHTML se
// sont retrouvés en double), une clé d'objet répétée, un argument répété, du code après un
// return, une comparaison impossible. `no-undef` est activé pour les bancs d'essai (modules,
// tout est importé) ; pour les pages de l'app, qui partagent des globales entre fichiers
// classiques (config.js déclare, gestion.js utilise), il dirait faux : les doublons entre
// fichiers sont tenus par tests/une-seule-copie.test.mjs.
import globals from 'globals';

export default [
  // app/vendor : deux bibliothèques embarquées telles quelles (voir app/vendor/LISEZ-MOI.md). On ne
  // relit pas le code des autres avec nos règles, et on ne le modifie pas pour les satisfaire.
  { ignores: ['node_modules/**', 'videos/**', 'images/**', '_sql-prive/**', 'supabase-functions/**', 'app/vendor/**'] },
  {
    files: ['app/**/*.js', 'sw.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser, ...globals.serviceworker } },
    rules: {
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-dupe-else-if': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-self-compare': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-func-assign': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
    },
  },
  {
    files: ['tests/**/*.mjs', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-undef': 'error', 'no-redeclare': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error' },
  },
  // Les parcours navigateur (4.10) contiennent du code exécuté DANS la page (page.evaluate) :
  // il lit les globales de l'app (allColis, totauxArgent…). no-undef y dirait faux.
  {
    files: ['tests/parcours/**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-undef': 'off' },
  },
];
