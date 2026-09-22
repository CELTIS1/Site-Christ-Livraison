/* LE POINT À VOIR — 22 septembre 2026
   Celtis : « lorsqu'on clique, ça nous envoie sur le point concerné, que ce soit la vendeuse ou
   le livreur. Avec une couleur. Et tant qu'on n'a pas touché, il faut que ce soit toujours
   encadré. Et si c'est plusieurs, pareil. »
   Ce banc fait tourner la règle (app/equipe/17-le-point-a-voir.js) et relit le serveur : la
   notification doit porter la cliente ET le jour, et le jour doit être celui de la remise. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, c, d) { if (c) { reussies++; console.log('  ✅ ' + t); } else { echouees++; console.log('  ❌ ' + t + (d !== undefined ? '\n       → ' + JSON.stringify(d).slice(0, 300) : '')); } }

const bac = { window: {}, URLSearchParams, Array, Object, String, JSON, console };
vm.runInNewContext(lire('app/equipe/17-le-point-a-voir.js'), bac);
const P = bac.window.CLTPointAVoir;

console.log('\n1. L\'adresse de la notification dit qui, et quel jour');
verifier('?point=<cliente>&jour= → la cliente, ce jour-là', JSON.stringify(P.lireDepuisURL('?point=V1&jour=2026-09-21')) === '{"qui":"cliente","id":"V1","jour":"2026-09-21"}');
verifier('?point-livreur=<livreur> → le livreur, sans jour (celui du récapitulatif)', JSON.stringify(P.lireDepuisURL('?point-livreur=L1')) === '{"qui":"livreur","id":"L1","jour":""}');
verifier('un jour mal formé est ignoré, pas planté', P.lireDepuisURL('?point=V1&jour=hier').jour === '');
verifier('sans paramètre, rien', P.lireDepuisURL('?colis=abc') === null && P.lireDepuisURL('') === null);

console.log('\n2. Plusieurs notifications, plusieurs cadres — et chacun tient jusqu\'à son geste');
let l = [];
l = P.ajouter(l, P.lireDepuisURL('?point=V1&jour=2026-09-21'));
l = P.ajouter(l, P.lireDepuisURL('?point=V2&jour=2026-09-21'));
l = P.ajouter(l, P.lireDepuisURL('?point=V1&jour=2026-09-21'));
verifier('deux clientes, deux marques ; la même notification deux fois n\'en fait pas trois', l.length === 2, l);
verifier('V1 est à voir le 21, pas le 22', P.estAVoir(l, 'cliente', 'V1', '2026-09-21') && !P.estAVoir(l, 'cliente', 'V1', '2026-09-22'));
l = P.retirer(l, 'cliente', 'V1', '2026-09-21');
verifier('ouvrir la carte de V1 retire SA marque et laisse celle de V2', !P.estAVoir(l, 'cliente', 'V1', '2026-09-21') && P.estAVoir(l, 'cliente', 'V2', '2026-09-21'));
l = P.ajouter(l, P.lireDepuisURL('?point-livreur=L1'));
verifier('le point d\'un livreur se marque à part, sans se mêler aux clientes', P.estAVoir(l, 'livreur', 'L1', '') && !P.estAVoir(l, 'cliente', 'L1', ''));

console.log('\n3. Le serveur envoie l\'adresse exacte, et l\'écran la suit');
const srv = lire('supabase-functions/envoyer-push/index.ts');
verifier('« Journée bouclée » et « la journée a changé » portent la cliente ET le jour', /const cible = `point=\$\{encodeURIComponent\(id\)\}&jour=/.test(srv) && (srv.match(/, cible\);/g) || []).length === 2);
verifier('« a fait son point » porte le livreur', /`point-livreur=\$\{encodeURIComponent\(livreur\)\}`/.test(srv));
const ecran = lire('app/equipe/17-le-point-a-voir.js');
verifier('l\'écran ouvre Suivi, pose le jour, déplie, et fait défiler jusqu\'à la carte', /showEquipeTab\('suivi'\)/.test(ecran) && /recap-date/.test(ecran) && /scrollIntoView/.test(ecran));
verifier('la marque survit au rechargement (mémoire de l\'appareil) et part au clic sur la carte', /localStorage\.setItem\(CLE/.test(ecran) && /closest\('\.recap-client-card'\)/.test(ecran));
verifier('l\'adresse est nettoyée après lecture : un rechargement ne rejoue pas le lien', /history\.replaceState/.test(ecran));
const css = lire('app/style.css');
verifier('le cadre est orange et visible, avec « à traiter »', /\.recap-client-card--a-voir\{border:2px solid var\(--orange\)/.test(css) && /\.recap-a-voir\{/.test(css));
verifier('la page charge le fichier', /equipe\/17-le-point-a-voir\.js\?v=/.test(lire('app/equipe.html')));

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
