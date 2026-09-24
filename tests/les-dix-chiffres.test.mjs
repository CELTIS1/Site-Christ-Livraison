/* LES DIX CHIFFRES DU DIRIGEANT + LE BUREAU DU GÉRANT — chantier N, lot 15 (25 septembre 2026)
   ==========================================================================================
   « Le rôle du dirigeant à distance » : dix chiffres, deux minutes, le mardi. Et un seul espace :
   Gestion vit derrière l'onglet « Bureau » de l'application de l'équipe.

   CE QUE CE BANC GARDE
     1. Les dix chiffres se calculent à partir de lignes lues, avec les seuils du dossier.
     2. Chaque chiffre dit où aller.
     3. L'onglet Bureau de l'équipe charge gestion.html « intégré » (sans sa barre du haut),
        réservé aux droits (admin, paie, compta) ; gestion.html sait se rendre intégré.
     4. Le tableau de bord de Gestion ouvre sur les dix chiffres.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + String(detail).slice(0, 320) : '')); }
}
const ctx = vm.createContext({ window: {}, console });
vm.runInContext(lire('app/dix-chiffres.js'), ctx);
const D = ctx.window.CLTDixChiffres;
const AUJ = '2026-09-25';
const iso = (j, h) => { const d = new Date(AUJ + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + j); d.setUTCHours(h || 10); return d.toISOString(); };

console.log('\n1. Le calcul');
const colis = [];
for (let i = 0; i < 20; i++) colis.push({ id: 'l' + i, statut: 'livre', livre_at: iso(-(i % 6), 15), created_at: iso(-(i % 6), 8), fournisseur_id: 'F' + (i % 4), livreur_id: 'L1' });
for (let i = 0; i < 10; i++) colis.push({ id: 'p' + i, statut: 'livre', livre_at: iso(-8 - (i % 5), 15), created_at: iso(-8 - (i % 5), 8), fournisseur_id: 'F' + (i % 4), livreur_id: 'L1' });
colis.push({ id: 'e1', statut: 'non_livre', non_livre_at: iso(-1, 16), created_at: iso(-1, 8), fournisseur_id: 'F1', livreur_id: 'L1', echec_imputable: true });
colis.push({ id: 'e2', statut: 'non_livre', non_livre_at: iso(-2, 16), created_at: iso(-2, 8), fournisseur_id: 'F2', livreur_id: 'L1', echec_imputable: false });
colis.push({ id: 's1', statut: 'en_attente', created_at: iso(0, 8), fournisseur_id: 'F1', livreur_id: null });
colis.push({ id: 'vieux', statut: 'livre', livre_at: iso(-40, 15), created_at: iso(-40, 8), fournisseur_id: 'F9', livreur_id: 'L1' });
const C = D.dixChiffres({
  colis,
  reclamations: [{ id: 'r1', statut: 'ouverte', created_at: iso(-3, 9) }, { id: 'r2', statut: 'ouverte', created_at: iso(0, 9) }, { id: 'r3', statut: 'resolue', created_at: iso(-5, 9) }],
  demandes: [{ id: 'd1', created_at: iso(-4, 9), traitee_at: iso(-3, 9) }, { id: 'd2', created_at: iso(-2, 9), traitee_at: iso(-2, 21) }],
  ecarts: [{ id: 'x', ecart: -500 }, { id: 'y', ecart: 0 }],
  remisesAttendues: [{ livreur_id: 'L1', reste: 30000, urgent: true }, { livreur_id: 'L2', reste: 4000, urgent: false }],
  clientesAReverser: [{ fournisseur_id: 'F1', net: 15000, urgent: true }, { fournisseur_id: 'F2', net: 2000, urgent: false }],
}, AUJ);
const par = Object.fromEntries(C.map(c => [c.cle, c]));
verifier('dix chiffres, dans l\'ordre du dossier', C.length === 10 && C.map(c => c.cle).join(',') === 'livres,echec,imputables,non_remis,non_reverse,ecarts,sans_livreur,delai_passage,clientes,signalements');
verifier('livrés : 20 cette semaine, 10 la semaine d\'avant → bon', par.livres.valeur === 20 && /10 la semaine/.test(par.livres.texte) && par.livres.verdict === 'bon', par.livres.texte);
verifier('échec : 2 sur 22 = 9,1 % → à regarder', par.echec.valeur === 9.1 && par.echec.verdict === 'regarder', par.echec.texte);
verifier('imputables : 1 sur 22 = 4,5 % → à regarder', par.imputables.valeur === 4.5 && par.imputables.verdict === 'regarder');
verifier('non remis > 1 j : 1 livreur, 30 000 F → alerte', par.non_remis.valeur === 1 && /30 000 F|30 000 F/.test(par.non_remis.texte.replace(/ /g, ' ')) && par.non_remis.verdict === 'alerte', par.non_remis.texte);
verifier('reversements en retard : 1 cliente → alerte', par.non_reverse.valeur === 1 && par.non_reverse.verdict === 'alerte');
verifier('écarts : 1 (l\'écart nul ne compte pas) → à regarder', par.ecarts.valeur === 1 && par.ecarts.verdict === 'regarder');
verifier('colis du jour sans livreur : 1 → à regarder', par.sans_livreur.valeur === 1 && par.sans_livreur.verdict === 'regarder');
verifier('délai demande → réponse : (1 j + 0,5 j) / 2 = 0,8 j → bon', par.delai_passage.valeur === 0.8 && par.delai_passage.verdict === 'bon', par.delai_passage.texte);
verifier('clientes : 4 actives, 1 endormie (F9) → bon', par.clientes.valeur === 4 && /1 endormie/.test(par.clientes.texte) && par.clientes.verdict === 'bon', par.clientes.texte);
verifier('signalements > 24 h : 1 (r1 ; r2 est d\'aujourd\'hui, r3 est résolu) → alerte', par.signalements.valeur === 1 && par.signalements.verdict === 'alerte');
verifier('chaque chiffre dit où aller (un onglet de l\'équipe)', C.every(c => ['suivi', 'retours', 'personnes', 'argent', 'colis', 'programmation'].includes(c.aller)));
verifier('le résumé compte les verdicts', JSON.stringify(D.resume(C)) === '{"bon":3,"regarder":4,"alerte":3}', JSON.stringify(D.resume(C)));

console.log('\n2. Le Bureau du gérant, dans la même application');
const equipe = lire('app/equipe.html'), onglets = lire('app/equipe/10-onglets.js'), direct = lire('app/equipe/09-express-et-temps-reel.js'), gestion = lire('app/gestion.html'), gjs = lire('app/gestion.js'), css = lire('app/style.css');
verifier('un onglet « Bureau » dans les deux barres de l\'équipe', /data-eqtab="bureau"/.test(equipe) && /data-nav="bureau"/.test(equipe));
verifier('EQ_TABS connaît « bureau », et l\'onglet charge gestion.html intégré à la première ouverture (iframe, lazy)', /'bureau'/.test(onglets) && /gestion\.html\?integre=1/.test(onglets) && /bureau-cadre/.test(onglets));
verifier('l\'onglet est réservé : admin, ou accès paie / compta (même règle que le lien d\'avant)', /bureau/.test(direct) && /acces_paie|acces_compta/.test(direct));
verifier('gestion.html sait se rendre intégré : classe html.integre, barre du haut cachée, « Retour équipe » caché', /integre/.test(gjs) && /html\.integre \.topbar\{[^}]*display:none/.test(css) && /classList\.add\('integre'\)/.test(gestion));
verifier('la hauteur du cadre suit l\'écran (100dvh moins les barres), sans double barre de défilement', /\.bureau-cadre\{[^}]*height:calc\(100dvh/.test(css));
verifier('les dix chiffres ouvrent le tableau de bord de Gestion (gestion-dix-chiffres.js, #dix-chiffres en tête de sec-dashboard)', /id="dix-chiffres"/.test(gestion) && gestion.indexOf('id="dix-chiffres"') < gestion.indexOf('id="rap-carte"') && /gestion-dix-chiffres\.js\?v=/.test(gestion) && /dix-chiffres\.js\?v=/.test(gestion));
verifier('l\'écran passe par la règle et par argent-a-suivre, et chaque tuile mène à l\'onglet de l\'équipe', /CLTDixChiffres\.dixChiffres\(/.test(lire('app/gestion-dix-chiffres.js')) && /CLTArgentASuivre/.test(lire('app/gestion-dix-chiffres.js')) && /data-dix-aller=/.test(lire('app/gestion-dix-chiffres.js')));
verifier('style : tuiles, trois teintes (bon / à regarder / alerte), mode nuit, 44 px', /\.dix-tuile--bon/.test(css) && /\.dix-tuile--regarder/.test(css) && /\.dix-tuile--alerte/.test(css) && /html\[data-theme="dark"\] \.dix-tuile\{/.test(css) && /\.dix-tuile\{[^}]*min-height:44px/.test(css));

console.log(`\n${reussies} vérifications réussies, ${echouees} en échec.`);
if (echouees) process.exit(1);
