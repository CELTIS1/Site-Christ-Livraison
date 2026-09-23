/* LES CAPTURES DU TUTORIEL DE L'ÉQUIPE (22/09/2026)
   Ouvre l'espace équipe sur le faux monde (tests/parcours/_monde.mjs), au format téléphone, et
   photographie les écrans que le tutoriel montre. Aucun vrai compte, aucune vraie donnée.
   Lancer :  node outils/tutoriel-equipe/captures.mjs   → outils/tutoriel-equipe/captures/*.png
   Puis :    node outils/tutoriel-equipe/pdf.mjs        → app/aide/tutoriel-suivi-espace-equipe.pdf */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ouvrirNavigateur, dodo } from '../../tests/parcours/_navigateur.mjs';
import { ADMIN, CLIENTE1, CLIENTE2, LIVREUR, aujourdhui, colis } from '../../tests/parcours/_monde.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ICI, 'captures'); fs.mkdirSync(OUT, { recursive: true });
const demain = (() => { const d = new Date(aujourdhui + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();

const N = await ouvrirNavigateur();
const { page, monde } = N;
// Un colis reporté à demain, reçu aujourd'hui ; une demande de passage pour demain.
monde.TABLES.colis.push(colis(8, { statut: 'recupere', created_at: aujourdhui + 'T07:30:00.000Z', recupere_at: aujourdhui + 'T08:30:00.000Z', reporte_au: demain, description: 'Robe bleue, taille M', fournisseur_id: CLIENTE1 }));
monde.TABLES.demandes_de_passage.push({ id: 'dddddddd-0000-4000-8000-000000000004', jour: demain, fournisseur_id: CLIENTE2, note: 'après 14 h, beaucoup de colis', statut: 'en_attente', motif_refus: null });

const shot = async (nom, opts) => { await page.screenshot(Object.assign({ path: path.join(OUT, nom + '.png') }, opts || {})); console.log('  📸', nom); };
const allerA = (sel, marge) => page.evaluate(([sel, marge]) => {
  const c = document.querySelector(sel), w = document.querySelector('.wrap');
  if (!c || !w) return false;
  w.style.scrollBehavior = 'auto';
  const y = c.getBoundingClientRect().top - w.getBoundingClientRect().top + w.scrollTop - (marge || 0);
  w.scrollTop = Math.max(0, y); return true;
}, [sel, marge || 0]);
const cacherToasts = () => page.evaluate(() => document.querySelectorAll('.clt-toast-layer, .clt-invit-bandeau, .clt-maj-bandeau').forEach(e => e.remove()));

// 1. L'accueil — L'essentiel
await N.ouvrirConnecte('equipe.html', ADMIN); await dodo(4000); await cacherToasts();
await page.evaluate(() => cltDefilerEnHaut(false)); await dodo(300);
await shot('01-accueil');

// 2. La carte d'un colis, menu ⋮ ouvert
await allerA('#colis-list .colis-item[data-id$="000000000004"]', 8);
await dodo(400);
await dodo(400); await shot('02-carte-colis');

// 3. Modifier : le formulaire, avec « Jour du colis »
await page.evaluate(() => { const b = document.querySelector('#colis-list .colis-item[data-id$="000000000004"] .btn-modifier-colis'); if (b) b.click(); });
await dodo(800);
await allerA('#colis-list .colis-item[data-id$="000000000004"] .edit-reporte-au', 300);
await dodo(400); await shot('03-modifier-colis');
await page.evaluate(() => { const b = document.querySelector('#colis-list .colis-item[data-id$="000000000004"] .btn-annuler-edition'); if (b) b.click(); });

// 4. Le colis reporté : sa carte dans la journée de réception
await dodo(400);
await allerA('#colis-list .colis-item[data-id$="000000000008"]', -150);
await dodo(400); await shot('04-colis-reporte');

// 5. Tournées : la demande de passage, encadrée comme après la notification
await N.ouvrirConnecte(`equipe.html?passage=dddddddd-0000-4000-8000-000000000004&jour=${demain}`, ADMIN); await dodo(4500); await cacherToasts();
await dodo(600); await shot('05-tournees-demande');

// 6. Suivi : le point d'une vendeuse, encadré après la notification
await N.ouvrirConnecte(`equipe.html?point=${CLIENTE2}&jour=${aujourdhui}`, ADMIN); await dodo(4500); await cacherToasts();
await dodo(600); await shot('06-suivi-point-encadre');

// 6b. Suivi : le point par livreur
await page.evaluate(() => { const b = document.getElementById('recap-livreur'); if (b && !b.classList.contains('open') && typeof toggleRecapLivreur === 'function') toggleRecapLivreur(); });
await dodo(1200);
await allerA('#recap-livreur', 8);
await dodo(500); await shot('09-suivi-livreur');

// 7. Retours
await N.ouvrirConnecte('equipe.html', ADMIN); await dodo(3500); await cacherToasts();
await page.evaluate(() => showEquipeTab('retours')); await dodo(1500);
await page.evaluate(() => cltDefilerEnHaut(false)); await dodo(300); await shot('07-retours');

// 8. « Plus »
await page.evaluate(() => { const b = document.getElementById('bottomnav-plus'); if (b) b.click(); }); await dodo(600);
await shot('08-plus');

await N.fermer();
console.log('Captures dans', OUT, '—', LIVREUR ? '' : '');
