/* LES DOSSIERS DE COMPTES — chantier N, lot 12 (24 septembre 2026)
   ==========================================================================================
   Celtis : « il suffit que je valide et tout disparaît ; que je refuse, tout disparaît. J'ai
   besoin de pouvoir les écrire ou les appeler, via WhatsApp ou directement, et de gérer les
   données qu'ils mettent. »

   CE QUE CE BANC GARDE
     1. Un dossier a un état lisible (qui a décidé, quand, pourquoi) — jamais « disparu ».
     2. Les quatre segments existent à l'écran, et une décision ne fait que changer de segment.
     3. Le message WhatsApp dit la vérité de l'état ; l'appel et WhatsApp acceptent tout indicatif.
     4. Les gestes montrés sont exactement ceux qui ont un sens dans l'état.
     5. L'écriture d'une décision porte QUI et QUAND ; un refus porte son motif.
     6. La pièce s'ouvre dans l'application (visionneuse), pas dans un onglet perdu.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(RACINE, 'app');
const lire = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const regle = lire('dossiers-de-comptes.js');
const comptes = lire('equipe/02-colis-et-comptes.js');
const html = lire('equipe.html');
const css = lire('style.css');
const login = lire('express-login.html');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}
const ctx = vm.createContext({ window: {}, console });
vm.runInContext(regle, ctx);
const R = ctx.window.CLTDossiersDeComptes;
const noms = { a1: 'Awa Bureau' };
const opts = { nomDe: (id) => noms[id] || 'le bureau', formatDate: (d) => String(d).slice(8, 10) + '/' + String(d).slice(5, 7) };

console.log('\n1. L\'état d\'un dossier se lit');
verifier('en attente, express, numéro pas vérifié', /En attente depuis le 24\/09 · numéro pas encore vérifié/.test(R.etatDuDossier({ status: 'en_attente', role: 'coursier_express', created_at: '2026-09-24T08:00:00Z' }, opts).texte));
verifier('accepté par X le …', R.etatDuDossier({ status: 'valide', decision_par: 'a1', decision_at: '2026-09-24T09:00:00Z' }, opts).texte === 'Accepté par Awa Bureau le 24/09');
verifier('refusé avec motif', R.etatDuDossier({ status: 'rejete', decision_par: 'zz', decision_at: '2026-09-24T09:00:00Z', decision_motif: 'pièce illisible' }, opts).texte === 'Refusé par le bureau le 24/09 · « pièce illisible »');
verifier('refusé sans motif : on le dit', /sans motif écrit/.test(R.etatDuDossier({ status: 'rejete' }, opts).texte));
verifier('suspendu avec motif', /Suspendu par Awa Bureau le 24\/09 · « fraude »/.test(R.etatDuDossier({ status: 'suspendu', suspendu_par: 'a1', suspendu_at: '2026-09-24T09:00:00Z', suspendu_motif: 'fraude' }, opts).texte));
verifier('les quatre segments', R.SEGMENTS.map(s => s.cle).join(',') === 'attente,acceptes,refuses,suspendus');
verifier('compter par segment', JSON.stringify(R.compterParSegment([{ status: 'en_attente' }, { status: 'valide' }, { status: 'valide' }, { status: 'rejete' }, { status: 'suspendu' }])) === '{"attente":1,"acceptes":2,"refuses":1,"suspendus":1}');

console.log('\n2. Les gestes selon l\'état');
const g = (p, o) => R.gestesDuDossier(p, o).join(' ');
verifier('en attente, coursier express non vérifié : appeler, whatsapp, pièce, code, accepter, refuser', g({ status: 'en_attente', role: 'coursier_express', phone: '0700', piece_identite_path: 'x' }) === 'appeler whatsapp piece code accepter refuser');
verifier('en attente, cliente sans téléphone : accepter, refuser seulement', g({ status: 'en_attente', role: 'fournisseur' }) === 'accepter refuser');
verifier('accepté : contact, et suspendre pour l\'admin seulement', g({ status: 'valide', role: 'client_express', phone: '0700' }, { estAdmin: true }) === 'appeler whatsapp suspendre' && g({ status: 'valide', role: 'client_express', phone: '0700' }, {}) === 'appeler whatsapp');
verifier('refusé : réexaminer', g({ status: 'rejete', role: 'client_express', phone: '0700' }) === 'appeler whatsapp reexaminer');
verifier('suspendu : rétablir pour l\'admin', g({ status: 'suspendu', role: 'livreur', phone: '0700' }, { estAdmin: true }) === 'appeler whatsapp retablir');

console.log('\n3. Le message WhatsApp dit la vérité');
verifier('en attente', /bien reçu votre demande de compte Coursier Express/.test(R.messageWhatsApp({ status: 'en_attente', role: 'coursier_express', full_name: 'Sery Koffi' })) && /Bonjour Sery,/.test(R.messageWhatsApp({ status: 'en_attente', role: 'coursier_express', full_name: 'Sery Koffi' })));
verifier('accepté', /est ouvert/.test(R.messageWhatsApp({ status: 'valide', role: 'client_express' })));
verifier('refusé, avec le motif', /pas pu ouvrir votre compte Coursier Express \(pièce illisible\)/.test(R.messageWhatsApp({ status: 'rejete', role: 'coursier_express', decision_motif: 'pièce illisible' })));
verifier('suspendu', /suspendu pour le moment/.test(R.messageWhatsApp({ status: 'suspendu', role: 'livreur' })));

console.log('\n4. L\'écriture d\'une décision');
const acc = R.ecritureDecision('accepter', 'a1');
verifier('accepter : valide, qui, quand, pas de motif', acc.status === 'valide' && acc.decision_par === 'a1' && /^\d{4}-/.test(acc.decision_at) && acc.decision_motif === null);
const ref = R.ecritureDecision('refuser', 'a1', '  pièce illisible ');
verifier('refuser : rejete, motif nettoyé', ref.status === 'rejete' && ref.decision_motif === 'pièce illisible');
verifier('refuser sans motif : motif null (pas une chaîne vide)', R.ecritureDecision('refuser', 'a1', '').decision_motif === null);
const re = R.ecritureDecision('reexaminer', 'a1');
verifier('réexaminer : retour en attente, décision effacée', re.status === 'en_attente' && re.decision_at === null && re.decision_par === null);
verifier('geste inconnu : rien', R.ecritureDecision('supprimer', 'a1') === null);

console.log('\n5. L\'écran de l\'équipe passe par la règle');
verifier('equipe.html charge dossiers-de-comptes.js', /dossiers-de-comptes\.js\?v=/.test(html));
verifier('la section s\'appelle « Dossiers de comptes » et a ses quatre segments', /Dossiers de comptes/.test(html) && /data-dossiers-segment="attente"/.test(html) && /data-dossiers-segment="acceptes"/.test(html) && /data-dossiers-segment="refuses"/.test(html) && /data-dossiers-segment="suspendus"/.test(html));
verifier('loadPending lit les quatre états et les colonnes de décision', /decision_at, decision_par, decision_motif/.test(comptes) && /\.in\('status', \['en_attente', 'valide', 'rejete', 'suspendu'\]\)/.test(comptes));
verifier('si les colonnes de décision manquent en base, on relit sans elles', /decision_at/.test(comptes) && /sans les colonnes de décision/.test(comptes));
verifier('la carte est rendue par dossierHTML, avec l\'état, les gestes de la règle, appel et WhatsApp par CLTNumero', /function dossierHTML\(/.test(comptes) && /R\.gestesDuDossier\(p/.test(comptes) && /CLTNumero\.pourAppel\(/.test(comptes) && /CLTNumero\.pourWhatsApp\(/.test(comptes) && /R\.messageWhatsApp\(p\)/.test(comptes));
verifier('accepter / refuser / réexaminer écrivent par ecritureDecision et tracent dans activity_log', /R\.ecritureDecision\(geste/.test(comptes) && /action: 'dossier_' \+ geste/.test(comptes));
verifier('refuser demande un motif (la personne le lira)', /refuserDossier|geste === 'refuser'[\s\S]*cltPrompt\(/.test(comptes));
verifier('la pièce s\'ouvre dans une visionneuse de l\'application (pas window.open)', /dossier-piece-visionneuse/.test(comptes) && !/window\.open\(data\.signedUrl/.test(comptes));
verifier('la photo de profil du dossier est montrée quand elle existe', /avatar_url/.test(comptes) && /dossier-avatar/.test(comptes));
verifier('style : carte de dossier, teintes ambre / vert / rouge / gris, mode nuit', /\.dossier-etat--ambre/.test(css) && /\.dossier-etat--vert/.test(css) && /\.dossier-etat--rouge/.test(css) && /\.dossier-etat--gris/.test(css) && /html\[data-theme="dark"\] \.dossier-carte/.test(css));
verifier('44 px : les gestes du dossier', /\.dossier-gestes \.btn\{[^}]*min-height:44px/.test(css));

console.log('\n6. La personne refusée lit le motif sur la page de connexion Express');
verifier('express-login relit decision_motif et l\'affiche', /decision_motif/.test(login) && /Votre demande de compte a été refusée/.test(login));

console.log(`\n${reussies} vérifications réussies, ${echouees} en échec.`);
if (echouees) process.exit(1);
