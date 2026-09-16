# Le contenu du site public

Les textes de la page d'accueil et de la page Services (accroche, services, étapes, zones,
partenaires, à propos, témoignages, questions fréquentes, contact, mentions) se modifient depuis
l'application : **Gestion › Site** (onglet réservé au gérant). On modifie un texte, on appuie sur
**Enregistrer**, et le site christlivraison.ci change à la seconde, sans mise en ligne. Les vingt
dernières versions sont gardées : le menu « Revenir à une version précédente… » les restaure.

Les textes vivent dans la base (table `site_contenu`, une seule ligne ; historique dans
`site_contenu_versions`). Le site les lit au chargement ; s'il ne les trouve pas (base injoignable
ou jamais enregistrée), il retombe sur `content/content.json`, qui reste dans le dépôt comme copie
de secours. Le bouton « Copie de secours » de l'éditeur recharge ce fichier à l'écran ; il n'est
publié qu'après un Enregistrer.

Jusqu'au 16 septembre 2026, un éditeur en ligne (`admin/`, Decap CMS) tenait ce rôle. Il dépendait
de Netlify et chargeait un script depuis un serveur extérieur, ce que la politique de sécurité du
site interdit : il a été retiré (feuille de route, décision 4) et remplacé par Gestion › Site.
