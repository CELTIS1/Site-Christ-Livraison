/* LE MENU ☰ ET LE HAUT DE L'ÉCRAN — 17 septembre 2026 (demande de Celtis)
   ==========================================================================================
   Trois remarques, le même jour, en ouvrant Gestion sur son téléphone :

   1. « En haut de l'écran, ça ne couvre pas jusqu'au haut de l'écran du téléphone […] il y a
      un bloc blanc qui est là. » — Cinq pages n'avaient pas viewport-fit=cover : sans lui, la
      page ne passe pas sous la barre d'état en mode application installée, et la couleur de
      l'en-tête s'arrête net, laissant une bande blanche. Les trois autres espaces l'avaient
      déjà, d'où un défaut qui ne se voyait que sur certaines pages.

   2. « Dans la couleur verte, les différents champs ou les options, tout ne s'affiche pas, il
      y en a qui sont coupés, et en plus ce n'est pas défilant. » — Sur Gestion, quatre boutons
      posés en ligne dans la barre faisaient 575 px sur un écran de 390 px, sans repli ni
      défilement : « Activer les notifications » était coupé et « Déconnexion » tombait hors de
      l'écran. On ne pouvait plus se déconnecter de Gestion depuis un téléphone.

   3. « Plutôt qu'une roue dentée dans le coin à droite, ce ne serait pas bien de mettre les
      trois barres de menu déroulant […] comme ça, s'il y a d'autres boutons ou d'autres
      options qu'on veut ajouter, il y a des sections ou des lignes là-bas, et que ce soit bien
      géré, comme ça dans tous les comptes. »

   Ce banc garde les trois acquis : le réglage du haut d'écran sur toutes les pages, le menu ☰
   avec ses sections dans tous les espaces, et une barre Gestion qui ne porte plus que le rôle.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}

/* Les pages de l'application : celles qui s'installent sur un téléphone et qui doivent donc
   toutes couvrir le haut de l'écran. */
const PAGES = fs.readdirSync(path.join(RACINE, 'app')).filter(f => f.endsWith('.html')).sort();
/* Celles qui portent une barre du haut avec le menu. express-login et login sont des pages de
   connexion : pas de barre, pas de menu. */
const ESPACES = ['equipe.html', 'livreur.html', 'fournisseur.html', 'gestion.html', 'express-client.html', 'express-coursier.html'];
const style = lire('app/style.css');

console.log('1. Le haut de l\'écran couvert partout (plus de bloc blanc)');
verifier(`les ${PAGES.length} pages de l'app déclarent viewport-fit=cover`,
  PAGES.every(p => /<meta name="viewport"[^>]*viewport-fit=cover/.test(lire('app/' + p))),
  PAGES.filter(p => !/viewport-fit=cover/.test(lire('app/' + p))).join(', '));
verifier('la barre du haut remonte derrière la barre d\'état (safe-area-inset-top)',
  /\.topbar\{[^}]*\}/s.test(style) && /padding-top:calc\(14px \+ env\(safe-area-inset-top\)\)/.test(style));
verifier('sur la page de connexion, le lien « Accueil » se décale aussi de la safe-area',
  /\.login-home-link\{[^}]*top:calc\(16px \+ env\(safe-area-inset-top, 0px\)\)/s.test(style));

console.log('\n2. Le menu ☰ à la place de la roue ⚙️, dans tous les comptes');
verifier('plus aucune roue dentée sur un bouton de menu',
  ESPACES.every(p => !/settings-menu-btn[^>]*>⚙️/.test(lire('app/' + p))),
  ESPACES.filter(p => /settings-menu-btn[^>]*>⚙️/.test(lire('app/' + p))).join(', '));
verifier('les trois barres sont dessinées en CSS, pas écrites avec un caractère',
  /\.settings-menu-btn::before\{[^}]*box-shadow:0 -5px 0 currentColor, 0 5px 0 currentColor/s.test(style));
verifier(`les ${ESPACES.length} espaces nomment ce bouton « Menu » pour la lecture d'écran`,
  ESPACES.every(p => /class="settings-menu-btn" id="settings-menu-btn" aria-label="Menu"/.test(lire('app/' + p))),
  ESPACES.filter(p => !/aria-label="Menu"/.test(lire('app/' + p))).join(', '));

console.log('\n3. Des sections, pour pouvoir ajouter la suite sans faire un fouillis');
verifier('chaque espace range ses entrées en groupes (.settings-groupe)',
  ESPACES.every(p => (lire('app/' + p).match(/class="settings-groupe"/g) || []).length >= 2),
  ESPACES.filter(p => (lire('app/' + p).match(/class="settings-groupe"/g) || []).length < 2).join(', '));
verifier('chaque espace titre au moins un groupe (« Mon espace »)',
  ESPACES.every(p => /class="settings-groupe-titre">Mon espace</.test(lire('app/' + p))));
verifier('la déconnexion est toujours seule dans le dernier groupe, séparée du reste',
  ESPACES.every(p => /<div class="settings-groupe">\s*<button type="button" class="danger"[^>]*>🚪 Se déconnecter<\/button>\s*<\/div>/.test(lire('app/' + p))),
  ESPACES.filter(p => !/<div class="settings-groupe">\s*<button type="button" class="danger"[^>]*>🚪 Se déconnecter<\/button>\s*<\/div>/.test(lire('app/' + p))).join(', '));
verifier('le style donne un titre et un trait à chaque groupe',
  /\.settings-groupe \+ \.settings-groupe\{[^}]*border-top:1px solid/s.test(style) && /\.settings-groupe-titre\{[^}]*text-transform:uppercase/s.test(style));
verifier('un lien (<a>) dans le menu se dessine comme un bouton : les entrées restent alignées',
  /\.settings-dropdown button,\s*\.settings-dropdown a\{/.test(style));

console.log('\n4. Le menu tient dans l\'écran, même quand il s\'allonge');
verifier('il défile au lieu de sortir par le bas (max-height + overflow-y)',
  /\.settings-dropdown\{[^}]*max-height:calc\(100vh - 90px\);\s*overflow-y:auto/s.test(style));
/* Le panneau s'ancrait « à droite du bouton ». Sur téléphone, la barre se replie et le bouton
   passe à gauche : le panneau sortait alors de l'écran par la gauche, texte coupé. Sous 760 px
   il s'ancre donc à l'écran, plus au bouton. */
/* Il reste un menu, pas une page qui s'ouvre : posé contre le bord droit, à la largeur d'un
   menu (272 px au plus), jamais toute la largeur de l'écran. */
verifier('sous 760 px, il s\'ancre au bord droit de l\'écran et non au bouton',
  /@media\(max-width:760px\)\{\s*\.settings-dropdown\{[^}]*position:fixed;[^}]*left:auto; right:12px/s.test(style));
verifier('il garde une largeur de menu (272 px au plus), pas toute la largeur',
  /@media\(max-width:760px\)\{\s*\.settings-dropdown\{[^}]*width:min\(272px, calc\(100vw - 24px\)\)/s.test(style));
verifier('sur téléphone, les trois ronds de la barre font 44 px (règle 2.4) et restent ronds',
  /\.settings-menu-btn, \.theme-toggle--entete, \.clt-actualiser\{ width:44px; height:44px; \}/.test(style));

console.log('\n5. La barre de Gestion ne déborde plus');
const gestionHtml = lire('app/gestion.html');
const gestionJs = lire('app/gestion.js');
verifier('ses quatre boutons ne sont plus posés en ligne dans la barre',
  !/<div class="user-info">\s*<a href="equipe\.html" class="g-back">/.test(gestionHtml)
  && !/class="g-back"/.test(gestionHtml));
verifier('ils sont dans le menu : notifications, grille tarifaire, retour équipe, déconnexion',
  /id="btn-activer-push"/.test(gestionHtml) && /id="btn-tarifs"/.test(gestionHtml)
  && /<a href="equipe\.html">↩️ Retour équipe<\/a>/.test(gestionHtml)
  && /onclick="logout\(\)"/.test(gestionHtml));
verifier('la barre ne garde que le rôle, qui se lit sans se toucher',
  /<div class="topbar-identite">\s*<span class="role-pill" id="role-pill">/.test(gestionHtml));
verifier('elle se replie en deux groupes comme les autres espaces (user-info--groupes)',
  /class="user-info user-info--groupes"/.test(gestionHtml)
  && /<div class="topbar-actions">/.test(gestionHtml));
verifier('gestion.js branche le menu au démarrage (initSettingsMenu)',
  /initSettingsMenu\(\);/.test(gestionJs));

console.log('\n6. Le haut des écrans de l\'équipe, dégonflé (17/09/2026, point 9.2)');
const equipe = lire('app/equipe.html');
verifier('la phrase « le suivi de tous les colis » ne coiffe plus les huit onglets',
  !/page-sub">Voici le suivi de tous les colis/.test(equipe),
  'elle était fausse partout sauf sur Colis : sur Finances on regarde l\'argent');
verifier('la salutation tient sur une ligne et porte un identifiant',
  /id="eq-salutation"/.test(equipe) && /page-title--salut/.test(equipe));
verifier('elle ne s\'affiche que sur l\'onglet d\'accueil, comme « L\'essentiel »',
  /getElementById\('eq-salutation'\)\?\.classList\.toggle\('hidden', key !== 'colis'\)/.test(lire('app/equipe/10-onglets.js')));

console.log('\n7. Les 44 px dans tous les espaces, pas seulement chez le livreur (point 9.1)');
verifier('la règle existe et ne vise que le téléphone',
  /@media\(max-width:760px\)\{[\s\S]{0,900}?\.btn, \.btn-sm, \.btn-outline, \.tab, \.subtab[\s\S]{0,400}?min-height:44px/.test(style));
verifier('elle couvre aussi les champs de saisie et les listes déroulantes',
  /input\[type="date"\][\s\S]{0,300}?select\{\s*min-height:44px/.test(style));
verifier('les liens qu\'on touche comme des boutons sont traités (numéro, « sans photo »)',
  /\.colis-tel, \.lien-nu\{ display:inline-flex; align-items:center; min-height:44px; \}/.test(style));
verifier('les cases à cocher font 24 px, la mesure déjà retenue pour le livreur',
  /input\[type="checkbox"\], input\[type="radio"\]\{ min-width:24px; min-height:24px; \}/.test(style));
/* Le piège dans lequel je suis tombé en écrivant ce point : une règle posée AVANT celle qu'elle
   corrige n'a aucun effet, à spécificité égale. Les pastilles de « L'essentiel » sont restées à
   38 px deux essais de suite pour cette raison. Ce contrôle garde l'ordre. */
const iBase = equipe.indexOf('#section-aujourdhui .ess-tuile{');
const iCorrection = equipe.indexOf('@media(max-width:760px){ #section-aujourdhui .ess-tuile{ min-height:44px; } }');
verifier('les pastilles de « L\'essentiel » passent à 44 px, et la règle est bien APRÈS la leur',
  iBase !== -1 && iCorrection !== -1 && iCorrection > iBase,
  'une règle de même spécificité placée avant ne sert à rien');

console.log('\n8. Les compteurs à zéro s\'effacent (point 9.3, rouvert avec Celtis le 17/09)');
const essentiel = lire('app/equipe/03-file-hors-reseau.js');
verifier('« comptes à valider » et « mots de passe à refaire » passent par la même pastille que les autres',
  /pastille\(nbPending, 'comptes à valider'/.test(essentiel) && /pastille\(nbReset,   'mots de passe à refaire'/.test(essentiel));
verifier('le raccourci qui gardait les zéros visibles n\'existe plus',
  !/const raccourci = /.test(essentiel) && !/ess-tuile est-vide" data-aller/.test(essentiel));
/* Ce qui rendait la décision possible : le chemin vers les comptes ne dépend pas de la pastille.
   L'onglet est là en permanence, en haut sur ordinateur et dans la barre du bas sur téléphone. */
verifier('l\'onglet « Comptes » reste atteignable en permanence, des deux barres',
  /data-eqtab="comptes"/.test(equipe) && /data-nav="comptes"/.test(equipe));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
