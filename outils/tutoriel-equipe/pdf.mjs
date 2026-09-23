/* Fabrique app/aide/tutoriel-suivi-espace-equipe.pdf à partir de tutoriel.html et des captures.
   Lancer après captures.mjs :  node outils/tutoriel-equipe/pdf.mjs */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const SORTIE = path.resolve(ICI, '../../app/aide/tutoriel-suivi-espace-equipe.pdf');
const navigateur = await chromium.launch();
const page = await navigateur.newPage();
await page.goto('file://' + path.join(ICI, 'tutoriel.html'), { waitUntil: 'networkidle' });
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: SORTIE, format: 'A4', printBackground: true, preferCSSPageSize: true });
await navigateur.close();
console.log('PDF écrit :', SORTIE);
