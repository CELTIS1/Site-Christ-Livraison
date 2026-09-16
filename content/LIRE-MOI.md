# Le contenu du site public

`content.json` porte les textes de la page d'accueil et de la page Services (services proposés,
descriptions détaillées). Les pages le lisent au chargement.

Jusqu'au 16 septembre 2026, un éditeur en ligne (`admin/`, Decap CMS) permettait de le modifier
depuis un navigateur. Il se connectait à GitHub par l'intermédiaire de Netlify : sans Netlify, il
ne pouvait plus fonctionner, et il chargeait un script depuis un serveur extérieur, ce que la
politique de sécurité du site interdit partout ailleurs. Il a été retiré (feuille de route,
décision 4 : recommandé « retirer », appliqué le 16 septembre 2026).

Pour modifier un texte du site : éditer `content/content.json` (un fichier JSON, lisible), valider,
puis mettre en ligne comme d'habitude — ou le demander à Claude, qui le fait et le vérifie.
