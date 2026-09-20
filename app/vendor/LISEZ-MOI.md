# Bibliothèques embarquées (app/vendor)

Deux bibliothèques servies depuis notre propre domaine, et non depuis un CDN : elles ne se
chargent qu'au clic (imprimer des étiquettes, scanner), le service worker les garde pour le hors
connexion, et aucune empreinte extérieure n'est à tenir à jour. Fichiers copiés tels quels depuis
npm le 20 septembre 2026 — ne pas les modifier ; pour monter de version, remplacer le fichier et
son nom.

| Fichier | Paquet npm | Version | Licence | Sert à |
|---|---|---|---|---|
| `qrcode-generator-1.4.4.js` | qrcode-generator (Kazuhiko Arase) | 1.4.4 | MIT | dessiner le QR des étiquettes |
| `jsQR-1.4.0.js` | jsqr (Cosmo Wolfe) | 1.4.0 | Apache-2.0 | lire un QR quand le navigateur ne sait pas le faire seul (iPhone) |

Sur Android, le scan passe par le lecteur du navigateur (`BarcodeDetector`) : `jsQR` n'est alors
jamais téléchargé.
