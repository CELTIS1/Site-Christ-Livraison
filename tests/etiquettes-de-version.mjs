/* Le contrôle des étiquettes de version, écrit une seule fois.
   ------------------------------------------------------------------------------------------
   À QUOI SERT UNE ÉTIQUETTE DE VERSION

   Les pages de l'application chargent leurs fichiers partagés avec un « ?v=… » à la fin :
   config.js?v=20260822tel1. Ce bout de texte ne sert à rien d'autre qu'à changer : le jour où
   il change, le navigateur considère qu'il s'agit d'une autre adresse et va rechercher le
   fichier au lieu de servir celui qu'il garde en mémoire.

   D'où la règle de la maison : un fichier partagé qui a changé doit changer d'étiquette, et
   tous les fichiers partagés portent la même étiquette au même moment. Sinon un écran neuf
   se retrouve chargé avec un ancien code — des boutons qui appellent des fonctions qui
   n'existent pas encore, et un écran qui se fige sans le moindre message.

   POURQUOI CE FICHIER EXISTE

   Ce contrôle a été écrit le 21 août 2026, puis recopié à l'identique dans quatre bancs
   d'essai. Les copies ont divergé en une journée : trois surveillaient trois fichiers, la
   quatrième en surveillait quatre. Et aucune ne surveillait theme.js — si bien que le
   bouton clair/sombre, remonté dans la barre du haut le 21 août au soir, a été publié le 22
   avec l'étiquette du 15. Le contrôle censé empêcher exactement cela est passé à côté, parce
   que sa liste n'avait pas suivi.

   C'est la même leçon que la compression des photos, qui existait en trois exemplaires
   recopiés et avait fait oublier la page équipe pendant des mois : un contrôle recopié n'est
   pas un contrôle renforcé, c'est un contrôle qu'on oubliera de mettre à jour quelque part.
   Il n'existe donc plus qu'ici, et les quatre bancs d'essai l'appellent.

   AJOUTER UN FICHIER PARTAGÉ : ajoutez son nom à FICHIERS_PARTAGES ci-dessous, et à rien
   d'autre. */

import fs from 'node:fs';
import path from 'node:path';

/* Les fichiers chargés par plusieurs pages, qui doivent donc bouger ensemble.
   express-config.js n'en fait délibérément PAS partie : il n'est chargé que par les trois
   pages Express, il suit son propre rythme de publication, et l'expression régulière
   ci-dessous l'écarte d'elle-même (elle exige un guillemet juste avant le nom du fichier,
   ce qui distingue "config.js" de "express-config.js"). */
export const FICHIERS_PARTAGES = [
  'config.js',
  'style.css',
  'clt-common.js',
  // Entré dans le groupe le 21 août 2026, à la suite d'une erreur évitée de peu. Ce fichier
  // portait sa propre étiquette, plus ancienne, et le correctif de la liste de recherche sur
  // téléphone — celle qui se fermait au défilement et passait sous le clavier — vit dedans.
  // Le publier sans bouger son étiquette aurait laissé les téléphones sur l'ancienne copie :
  // le bug signalé serait resté visible, les essais au vert, et personne n'aurait su où
  // chercher.
  'clt-select-recherche.js',
  // Entré dans le groupe le 23 août 2026, cette fois après l'erreur et non avant. Le bouton
  // clair/sombre a été remonté dans la barre du haut le 21 au soir ; theme.js a bien été
  // modifié, mais il n'était surveillé par aucune des quatre copies du contrôle, et il a été
  // publié le 22 avec l'étiquette du 15.
  'theme.js',
];

/* Relève, page par page, l'étiquette portée par chaque fichier partagé.
   Renvoie une Map : étiquette → liste des « page → fichier » qui la portent. */
export function releverEtiquettes(APP) {
  const motif = new RegExp(
    '(?:src|href)="(' + FICHIERS_PARTAGES.map(f => f.replace('.', '\\.')).join('|') + ')\\?v=([^"]+)"',
    'g'
  );
  const versions = new Map();
  fs.readdirSync(APP).filter(f => f.endsWith('.html')).forEach(f => {
    const src = fs.readFileSync(path.join(APP, f), 'utf8');
    let m;
    while ((m = motif.exec(src))) {
      if (!versions.has(m[2])) versions.set(m[2], []);
      versions.get(m[2]).push(f + ' → ' + m[1]);
    }
  });
  return versions;
}

/* Le contrôle lui-même. On lui passe le dossier app/ et la fonction « verifier » du banc
   d'essai appelant, pour que le résultat se compte avec les autres. */
export function controlerEtiquettesDeVersion({ APP, verifier }) {
  const versions = releverEtiquettes(APP);
  const etiquettes = Array.from(versions.keys());

  verifier(
    'une seule étiquette de version pour tous les fichiers partagés',
    etiquettes.length === 1,
    etiquettes.map(v => v + ' : ' + versions.get(v).join(', ')).join('\n       → ')
  );

  /* Second contrôle, moins évident et tout aussi nécessaire : que chaque fichier de la liste
     soit réellement trouvé quelque part. Sans lui, renommer un fichier ou oublier son « ?v= »
     le ferait sortir de la surveillance en silence — et un contrôle qui ne regarde plus rien
     passe au vert tous les jours en ne prouvant plus rien. */
  const surveilles = new Set();
  versions.forEach(liste => liste.forEach(e => surveilles.add(e.split(' → ')[1])));
  const introuvables = FICHIERS_PARTAGES.filter(f => !surveilles.has(f));
  verifier(
    'chaque fichier partagé est effectivement surveillé',
    introuvables.length === 0,
    introuvables.length
      ? 'jamais rencontré avec une étiquette dans app/*.html : ' + introuvables.join(', ')
      : ''
  );
}
