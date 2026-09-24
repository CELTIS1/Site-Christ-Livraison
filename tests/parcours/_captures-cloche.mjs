/* OUTIL — CAPTURES : LA CLOCHE MÈNE PARTOUT (24/09/2026). Pas un parcours : une lampe.
   Ouvre le panneau de la cloche chez la cliente et chez l'administrateur (Gestion), sur téléphone et
   ordinateur, puis clique une ligne et capture l'arrivée (demande de passage, reçu, point du jour).
   DOSSIER=/tmp/captures-cloche node tests/parcours/_captures-cloche.mjs */
import fs from 'node:fs';
import { ouvrirNavigateur, dodo } from './_navigateur.mjs';
import { nouveauMonde, iso, aujourdhui, ADMIN, CLIENTE1, CLIENTE2 } from './_monde.mjs';

const DOSSIER = process.env.DOSSIER || '/tmp/captures-cloche';
fs.mkdirSync(DOSSIER, { recursive: true });
const monde = nouveauMonde();
const DEMANDE = 'dddddddd-0000-4000-8000-000000000001';
const RECU = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
monde.TABLES.demandes_de_passage.push({ id: DEMANDE, jour: aujourdhui, fournisseur_id: CLIENTE1, note: 'après 14 h', statut: 'traitee', motif_refus: null });
monde.TABLES.notifications = [
  { id: 1, user_id: CLIENTE1, titre: '👀 Votre demande de passage est vue', corps: 'CLT programme la tournée du jour ; le livreur vous confirmera.', tag: 'passage-1', url: null, param: 'passage=' + DEMANDE, cree_le: iso(0, 9), lu_le: null },
  { id: 2, user_id: CLIENTE1, titre: '✅ CLT a répondu à votre signalement', corps: 'Le colis a été retrouvé, il part demain matin.', tag: 'reclam-1', url: null, param: 'colis=cccccccc-cccc-4ccc-8ccc-000000000005', cree_le: iso(-1, 16), lu_le: iso(-1, 17) },
  { id: 3, user_id: CLIENTE2, titre: '💵 Reversement effectué', corps: '10 000 FCFA vous ont été reversés (reçu REV-2026-0004). Le reçu est dans votre espace.', tag: 'reversement-1', url: null, param: 'reversement=' + RECU, cree_le: iso(0, 10), lu_le: null },
  { id: 4, user_id: ADMIN, titre: '📗 Journée bouclée', corps: 'Mariam Mode : 1 colis, 10 000 FCFA.', tag: 'journee-1', url: null, param: 'point=' + CLIENTE2 + '&jour=' + aujourdhui, cree_le: iso(0, 11), lu_le: null },
];
const N = await ouvrirNavigateur({ monde });
const page = N.page;
async function scene(nom, largeur, pageHtml, qui, ligne) {
  monde.TABLES.notifications.forEach((n) => { if (n.id === ligne) n.lu_le = null; });
  await page.setViewportSize({ width: largeur, height: largeur < 500 ? 844 : 900 });
  await N.ouvrirConnecte(pageHtml, qui); await dodo(1800);
  await page.locator('.clt-cloche').click(); await dodo(700);
  await page.screenshot({ path: `${DOSSIER}/${nom}--${largeur}--1-panneau.png` });
  await page.locator(`.notif-ligne[data-notif="${ligne}"]`).click(); await dodo(3000);
  await page.screenshot({ path: `${DOSSIER}/${nom}--${largeur}--2-arrivee.png` });
}
for (const l of [390, 1440]) {
  await scene('cliente-passage', l, 'fournisseur.html', CLIENTE1, 1);
  await scene('cliente-recu', l, 'fournisseur.html', CLIENTE2, 3);
  await scene('gestion-point', l, 'gestion.html', ADMIN, 4);
}
console.log('captures dans', DOSSIER);
await N.fermer();
