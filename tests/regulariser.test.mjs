/* RÉGULARISER — 22 septembre 2026
   ==========================================================================================
   Celtis : « les colis retour qui vont chez les dames ont été déjà retournés, l'argent était
   déjà versé… il faut que je sois capable de rattraper tout, de corriger tout ». Ce banc fait
   tourner la règle (app/regulariser.js) sur des colis pour de vrai, avec l'addition de la
   maison (lib/argent.js) branchée dessus — pas une imitation.

   CE QU'IL SURVEILLE, ET POURQUOI :
     1. le travail du jour n'est jamais proposé (sinon l'écran cocherait d'avance des gestes
        que personne n'a faits) ;
     2. l'écran ne propose que ce que la base accepterait : les conditions de candidature sont
        le miroir exact des refus de regulariser_colis() ;
     3. la parole de la cliente (retour_confirme_at) n'est ni lue ni posée ;
     4. les deux gardes (motif, date) sont dites AVANT l'aller-retour, en français ;
     5. l'écran et la migration parlent des mêmes trois actions, des mêmes plafonds.
   ========================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { chargerApp } from './_charger-app.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussies = 0, echouees = 0;
function verifier(t, condition, detail) {
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail !== undefined ? '\n       → ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

/* La règle, chargée comme le navigateur la charge. */
const bac = { window: {}, Date, Math, Number, Object, String, Array, Map, Set, RegExp, JSON };
vm.runInNewContext(lire('app/regulariser.js'), bac);
const R = bac.window.CLTRegulariser;

/* L'addition de la maison, la vraie. */
const app = chargerApp();
const enMain  = (c) => app.montantEnMainDuLivreur(c);
const aDevoir = (c) => app.montantArticleADevoir(c);

const JOUR = 86400000;
const AUJ = '2026-09-22';
const jour = (n) => new Date(Date.parse(AUJ + 'T12:00:00Z') - n * JOUR).toISOString().slice(0, 10) + 'T12:00:00.000Z';

const c = (id, o) => Object.assign({
  id, numero: 'N' + id, statut: 'livre', fournisseur_id: 'V1', livreur_id: 'L1',
  commune_destination: 'Cocody', montant_article: 10000, montant_livraison: 1500,
  frais_expedition: 0, frais_expedition_rembourse_at: null, frais_soldes_at: null,
  article_non_encaisse: false, livraison_payee: false, livraison_non_encaissee: false, livraison_payee_non_livre: false,
  encaissement_remis: false, encaissement_remis_at: null, reverse_au_fournisseur_at: null,
  retour_detenteur: null, retour_rendu_at: null, retour_confirme_at: null,
  created_at: jour(30), livre_at: jour(10), non_livre_at: null, retour_at: null,
}, o);

const noms = { V1: 'Nature Santé', V2: 'Chez Adjoua', L1: 'Gbei Franck', L2: 'Kasimir WANDAOGO' };
const opt = { avantLe: AUJ, noms, enMain, aDevoir };

console.log('\n1. Le travail du jour n\'est pas une anomalie');
{
  const hier = c('h', { livre_at: jour(1) });
  const cejour = c('j', { livre_at: jour(0) });
  verifier('livré hier → candidat à la remise', R.estCandidat(hier, 'remise_faite', opt));
  verifier('livré aujourd\'hui → PAS candidat (la remise du soir n\'a pas encore eu lieu)', !R.estCandidat(cejour, 'remise_faite', opt));
  const sansDate = c('s', { livre_at: null, created_at: null });
  verifier('sans date d\'événement lisible → laissé dehors plutôt que deviné', !R.estCandidat(sansDate, 'remise_faite', opt));
}

console.log('\n2. Ce que l\'écran propose, la base l\'accepterait (miroir des refus)');
{
  const retourOuvert = c('r1', { statut: 'retour', retour_at: jour(20), retour_detenteur: 'livreur' });
  const retourRendu  = c('r2', { statut: 'retour', retour_at: jour(20), retour_rendu_at: jour(15), retour_detenteur: 'cliente' });
  const pasUnRetour  = c('r3', {});
  verifier('un retour non rendu est candidat', R.estCandidat(retourOuvert, 'retour_rendu', opt));
  verifier('un retour déjà rendu ne l\'est pas (la base l\'ignorerait)', !R.estCandidat(retourRendu, 'retour_rendu', opt));
  verifier('un colis qui n\'est pas un retour ne l\'est pas', !R.estCandidat(pasUnRetour, 'retour_rendu', opt));

  const remisDeja = c('m1', { encaissement_remis: true });
  verifier('un colis déjà coché « remis » ne l\'est pas', !R.estCandidat(remisDeja, 'remise_faite', opt));
  const rienARemettre = c('m2', { statut: 'en_livraison', livre_at: null, created_at: jour(9), montant_article: 0, montant_livraison: 0 });
  verifier('un colis sans rien en main ne l\'est pas', !R.estCandidat(rienARemettre, 'remise_faite', opt));

  const reverseDeja = c('a1', { reverse_au_fournisseur_at: jour(5) });
  verifier('une cliente déjà payée ne l\'est pas', !R.estCandidat(reverseDeja, 'argent_reverse', opt));
  const rienADevoir = c('a2', { commune_destination: 'Expédition', montant_article: 0 });
  verifier('une expédition (article déjà payé chez la vendeuse) ne l\'est pas', !R.estCandidat(rienADevoir, 'argent_reverse', opt));
}

console.log('\n3. L\'avance de gare : le cas de Gbei Franck');
{
  // Un colis d'expédition où le livreur a payé la gare et n'a jamais été remboursé :
  // il est CRÉANCIER de CLT. L'écran doit le proposer, et le montant doit être négatif.
  const avance = c('g1', { commune_destination: 'Expédition', montant_article: 0, montant_livraison: 0, frais_expedition: 3000, livre_at: jour(12) });
  verifier('un colis avec avance de gare non remboursée est candidat à la remise', R.estCandidat(avance, 'remise_faite', opt));
  verifier('et le montant en main est négatif : c\'est CLT qui lui doit', enMain(avance) === -3000, enMain(avance));
  const avanceRemboursee = Object.assign({}, avance, { frais_expedition_rembourse_at: jour(11) });
  verifier('une fois l\'avance remboursée, il n\'est plus candidat', !R.estCandidat(avanceRemboursee, 'remise_faite', opt));
}

console.log('\n4. La parole de la cliente n\'est ni lue ni posée');
{
  const regle = lire('app/regulariser.js') + lire('app/regulariser-ecran.js');
  verifier('la règle et l\'écran ne touchent jamais retour_confirme_at', !/retour_confirme_at\s*[=:]/.test(regle));
  const migration = fs.existsSync(path.join(RACINE, '_sql-prive/2026-09-22-regulariser.sql'))
    ? lire('_sql-prive/2026-09-22-regulariser.sql') : null;
  if (migration === null) console.log('   (_sql-prive absent de ce dépôt : contrôle SQL sauté, il tourne sur le Mac)');
  else verifier('la migration ne l\'écrit pas non plus', !/set[\s\S]{0,400}retour_confirme_at\s*=/.test(migration));
}

console.log('\n5. Les deux gardes, dites avant l\'aller-retour et en français');
{
  verifier('un motif de neuf caractères est refusé', !R.motifValide('123456789'));
  verifier('un motif de dix caractères passe', R.motifValide('1234567890'));
  verifier('les espaces ne comptent pas pour du motif', !R.motifValide('   court   '));
  verifier('une date de demain est refusée', !R.dateValide('2026-09-23', AUJ));
  verifier('la date du jour passe', R.dateValide(AUJ, AUJ));
  verifier('une date vide est refusée', !R.dateValide('', AUJ));

  verifier('rien de coché → on le dit', /au moins un colis/i.test(R.pourquoiPasEncore([], 'un motif bien assez long', AUJ, AUJ)));
  verifier('plus de 500 colis → on le dit', /cinq cents/i.test(R.pourquoiPasEncore(new Array(501).fill('x'), 'un motif bien assez long', AUJ, AUJ)));
  verifier('date au futur → on le dit', /futur/i.test(R.pourquoiPasEncore(['x'], 'un motif bien assez long', '2026-12-01', AUJ)));
  verifier('motif trop court → on le dit, avec le pourquoi', /dix caractères/i.test(R.pourquoiPasEncore(['x'], 'court', AUJ, AUJ)));
  verifier('tout est là → rien ne s\'oppose', R.pourquoiPasEncore(['x'], 'un motif bien assez long', AUJ, AUJ) === null);
}

console.log('\n6. Le rangement : par cliente pour l\'argent, par livreur pour la remise');
{
  const lot = [
    c('1', { statut: 'retour', retour_at: jour(20), fournisseur_id: 'V1' }),
    c('2', { statut: 'retour', retour_at: jour(19), fournisseur_id: 'V1' }),
    c('3', { statut: 'retour', retour_at: jour(18), fournisseur_id: 'V2' }),
    c('4', { livreur_id: 'L1', montant_article: 50000 }),
    c('5', { livreur_id: 'L2', montant_article: 5000 }),
  ];
  const gr = R.groupes(lot, 'retour_rendu', opt);
  verifier('trois retours, deux clientes', gr.length === 2 && gr.reduce((n, g) => n + g.colis.length, 0) === 3, gr.map(g => [g.nom, g.colis.length]));
  verifier('les clientes portent leur nom', gr.some((g) => g.nom === 'Nature Santé') && gr.some((g) => g.nom === 'Chez Adjoua'));
  const gm = R.groupes(lot, 'remise_faite', opt);
  verifier('la remise se range par livreur', gm.every((g) => g.qui === 'livreur'));
  verifier('le plus lourd d\'abord', gm[0] && gm[0].nom === 'Gbei Franck', gm.map(g => [g.nom, g.montant]));
  const inconnu = R.groupes([c('9', { fournisseur_id: null, statut: 'retour', retour_at: jour(5) })], 'retour_rendu', opt);
  verifier('un colis sans cliente ne disparaît pas : « Cliente inconnue »', inconnu.length === 1 && inconnu[0].nom === 'Cliente inconnue');
}

console.log('\n7. Le compte rendu se lit en français');
{
  verifier('un seul', R.compteRendu(1, 0) === '1 colis corrigé.');
  verifier('plusieurs', R.compteRendu(12, 0) === '12 colis corrigés.');
  verifier('des ignorés', /déjà à jour/.test(R.compteRendu(3, 2)));
  verifier('aucun', /Aucun colis corrigé/.test(R.compteRendu(0, 4)));
}

console.log('\n8. L\'écran, la règle et la migration parlent des mêmes choses');
{
  const ecran = lire('app/regulariser-ecran.js');
  const html = lire('app/gestion.html');
  const gestion = lire('app/gestion.js');
  const cles = R.ACTIONS.map((a) => a.cle);
  verifier('trois actions, exactement celles de la base', JSON.stringify(cles) === JSON.stringify(['retour_rendu', 'remise_faite', 'argent_reverse']), cles);
  verifier('le plafond de l\'écran est celui de la base (500)', R.LOT_MAXI === 500);
  verifier('le minimum du motif est celui de la base (10)', R.MOTIF_MINI === 10);
  verifier('l\'écran appelle les trois fonctions de la base', ['regulariser_colis', 'defaire_regularisation', 'regularisations_faites'].every((f) => ecran.includes(f)));
  verifier('la page porte l\'onglet et la section', html.includes('id="tab-regul"') && html.includes('id="sec-regul"'));
  verifier('les deux fichiers sont chargés par la page', html.includes('regulariser.js?v=') && html.includes('regulariser-ecran.js?v='));
  verifier('l\'onglet est réservé à l\'administrateur', /setDisp\('tab-regul',\s*isAdmin\)/.test(gestion));
  verifier('l\'onglet est caché par défaut dans la page', /id="tab-regul"[^>]*display:none/.test(html));
  verifier('la règle ne touche ni au DOM ni à la base', !/document\.|supabaseClient/.test(lire('app/regulariser.js')));
  verifier('l\'écran redit ce que la base répond, il ne recompte pas', ecran.includes('compteRendu'));
  verifier('« défaire » est offert sur le même écran', /data-reg-defaire/.test(ecran));
  verifier('les mots « régularisé par le bureau », jamais « confirmé par la cliente »', /régularisé par le bureau/.test(html));
}

console.log('\n9. La migration : additive, journalisée, réservée à l\'administrateur');
{
  const f = path.join(RACINE, '_sql-prive/2026-09-22-regulariser.sql');
  if (!fs.existsSync(f)) console.log('   (_sql-prive absent de ce dépôt : contrôles sautés, ils tournent sur le Mac)');
  else {
    const m = lire('_sql-prive/2026-09-22-regulariser.sql');
    verifier('les trois colonnes, en add column if not exists', ['regularise_at', 'regularise_par', 'regularise_motif'].every((x) => new RegExp('add column if not exists ' + x).test(m)));
    verifier('aucun delete, aucun drop table', !/\bdelete\s+from\b/i.test(m) && !/\bdrop\s+table\b/i.test(m));
    verifier('l\'état d\'avant est archivé avant chaque changement', /insert into archives\.regularisations[\s\S]{0,400}to_jsonb\(v_c\)/.test(m));
    verifier('administrateur seul, sur les trois fonctions', (m.match(/is distinct from 'admin'/g) || []).length === 3);
    verifier('le schéma archives est retiré à anon et authenticated', /revoke all on schema archives from public, anon, authenticated/.test(m));
    verifier('l\'avance de gare n\'est soldée que s\'il y en avait une', /case when coalesce\(frais_expedition, 0\) > 0/.test(m));
    verifier('la migration s\'enregistre au registre', /migration_appliquee\('2026-09-22-regulariser\.sql'/.test(m));
  }
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
