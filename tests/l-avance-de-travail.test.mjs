/* L'AVANCE DE TRAVAIL, ET LES FRAIS ADDITIONNELS DU LIVREUR — 22 septembre 2026
   ==========================================================================================
   Deux demandes de Celtis le même jour, et le même argent :

   (1) « S'il a payé des frais additionnels, il faut que ce soit retranché dans son point et
       dans l'argent de la vendeuse. » Depuis le 16/09 ils se retenaient sur la VENDEUSE, mais
       nulle part ils ne sortaient de ce qu'on réclamait au LIVREUR le soir. Ce banc le prouve
       avec l'addition de la maison, la vraie — pas une imitation.

   (2) « On va donner de l'argent à l'agent livreur pour éviter de rentrer dans beaucoup de
       calculs… le soir, les comptes sont faciles avec le livreur. » C'est l'avance de travail.

   CE QU'IL SURVEILLE :
     • les frais additionnels se retranchent du point du livreur, et s'éteignent quand on les
       lui a rendus — sans jamais se confondre avec « la vendeuse les a réglés » ;
     • un solde négatif se DIT (« CLT vous doit »), il ne s'affiche jamais nu ;
     • le signe suit le geste : on tape toujours un montant positif ;
     • l'écran refuse avant la base, et il dit pourquoi, en français ;
     • l'écran, la règle et la migration parlent des mêmes montants et des mêmes mots.
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

const bac = { window: {}, Math, Number, String, Array, Object, RegExp };
vm.runInNewContext(lire('app/avance-de-travail.js'), bac);
const A = bac.window.CLTAvanceDeTravail;
const app = chargerApp();

const c = (o) => Object.assign({
  id: 'x', statut: 'livre', commune_destination: 'Cocody',
  montant_article: 10000, montant_livraison: 1500,
  article_non_encaisse: false, livraison_payee: false, livraison_non_encaissee: false, livraison_payee_non_livre: false,
  frais_expedition: 0, frais_expedition_rembourse_at: null,
  frais_additionnels_montant: 0, frais_additionnels_regle_at: null, frais_additionnels_rembourse_at: null,
  encaissement_remis: false, reverse_au_fournisseur_at: null, frais_soldes_at: null,
}, o || {});

console.log('\n1. Les frais additionnels sortent de la poche du livreur');
{
  verifier('sans frais, il porte 11 500', app.montantEnMainDuLivreur(c()) === 11500, app.montantEnMainDuLivreur(c()));
  const avec = c({ frais_additionnels_montant: 500 });
  verifier('avec 500 de frais additionnels avancés, il ne porte plus que 11 000',
    app.montantEnMainDuLivreur(avec) === 11000, app.montantEnMainDuLivreur(avec));
  const rendu = c({ frais_additionnels_montant: 500, frais_additionnels_rembourse_at: '2026-09-22T12:00:00Z' });
  verifier('une fois qu\'on les lui a rendus, ils ne se retranchent plus',
    app.montantEnMainDuLivreur(rendu) === 11500, app.montantEnMainDuLivreur(rendu));
  const regleParLaVendeuse = c({ frais_additionnels_montant: 500, frais_additionnels_regle_at: '2026-09-22T12:00:00Z' });
  verifier('« la VENDEUSE les a réglés » ne rend rien au livreur : les deux dates ne se confondent pas',
    app.montantEnMainDuLivreur(regleParLaVendeuse) === 11000, app.montantEnMainDuLivreur(regleParLaVendeuse));
  const deux = c({ frais_expedition: 3000, frais_additionnels_montant: 500 });
  verifier('gare et additionnels se cumulent : 11 500 − 3 000 − 500 = 8 000',
    app.montantEnMainDuLivreur(deux) === 8000, app.montantEnMainDuLivreur(deux));
}

console.log('\n2. La caisse du soir les compte aussi');
{
  const lot = [
    c({ id: '1', livreur_id: 'L1', frais_expedition: 3000, frais_additionnels_montant: 500 }),
    c({ id: '2', livreur_id: 'L1', statut: 'recupere', montant_article: 0, montant_livraison: 0, frais_additionnels_montant: 700 }),
  ];
  const ligne = app.caisseParLivreur(lot).find((l) => l.id === 'L1');
  verifier('ce qu\'il a avancé de sa poche : 3 000 + 500 + 700', ligne.gare === 4200, ligne.gare);
  verifier('le colis non livré n\'entre que par son avance', ligne.idsFraisARembourser.length === 1 && ligne.idsFraisARembourser[0] === '2', ligne.idsFraisARembourser);
  verifier('reste à remettre : 8 000 − 700', ligne.reste === 7300, ligne.reste);
  const releve = app.caisseEnMainDuLivreur(lot, 'L1');
  verifier('l\'écran du livreur annonce le même chiffre', releve.montant === 7300 && releve.gare === 4200, [releve.montant, releve.gare]);
  verifier('les écrans ne disent plus « à la gare » pour un frais qui peut être autre chose',
    !/Avancé à la gare/.test(lire('app/equipe/08-son-ecran.js')));
}

console.log('\n3. Le solde de l\'avance se dit, il ne s\'affiche jamais nu');
{
  verifier('positif : ce qu\'il a de CLT en main', /a 97 000 FCFA de CLT en main/.test(A.phraseDuSolde(97000, 'Gbei Franck')), A.phraseDuSolde(97000, 'Gbei Franck'));
  verifier('négatif : c\'est CLT qui doit, et le nom n\'est pas abîmé', /^CLT doit 4 000 FCFA à Gbei Franck/.test(A.phraseDuSolde(-4000, 'Gbei Franck')), A.phraseDuSolde(-4000, 'Gbei Franck'));
  verifier('zéro se dit aussi', /à zéro/.test(A.phraseDuSolde(0)));
  verifier('le solde est la somme des mouvements', A.solde([{ montant: 100000 }, { montant: -3000 }, { montant: -500 }]) === 96500);
  verifier('les milliers sont séparés, jamais collés', A.sou(1234567) === '1 234 567 FCFA', A.sou(1234567));
}

console.log('\n4. Le signe suit le geste : on tape toujours un montant positif');
{
  verifier('donner ajoute', A.montantSigne(100000, 'dotation') === 100000);
  verifier('reprendre retire, même si l\'on a tapé un positif', A.montantSigne(50000, 'remboursement') === -50000);
  verifier('reprendre retire, même si l\'on a tapé un négatif', A.montantSigne(-50000, 'remboursement') === -50000);
  verifier('une correction va dans les deux sens, et c\'est un choix', A.montantSigne(2000, 'correction', false) === 2000 && A.montantSigne(2000, 'correction', true) === -2000);
  verifier('aucune dépense ne se saisit à la main', !A.GENRES.some((g) => g.cle === 'depense'));
  verifier('mais elle se LIT en français', A.libelleGenre('depense') === 'Payé à la gare');
}

console.log('\n5. L\'écran refuse avant la base, et il dit pourquoi');
{
  verifier('sans livreur', /Choisissez le livreur/.test(A.pourquoiPasEncore(1000, 'dotation', 'un motif bien assez long', '')));
  verifier('sans montant', /Indiquez le montant/.test(A.pourquoiPasEncore(0, 'dotation', 'un motif bien assez long', 'L1')));
  verifier('au-dessus du plafond', /cinq millions/.test(A.pourquoiPasEncore(6000000, 'dotation', 'un motif bien assez long', 'L1')));
  verifier('motif trop court, avec le pourquoi', /dix caractères/.test(A.pourquoiPasEncore(1000, 'dotation', 'court', 'L1')));
  verifier('genre inconnu', /donner, reprendre ou corriger/.test(A.pourquoiPasEncore(1000, 'depense', 'un motif bien assez long', 'L1')));
  verifier('tout est là', A.pourquoiPasEncore(1000, 'dotation', 'avance de travail de départ', 'L1') === null);
  verifier('on ne ferme pas un compte qui n\'est pas à zéro, dans les deux sens',
    /détient encore/.test(A.pourquoiPasFermer(5000)) && /CLT lui doit encore/.test(A.pourquoiPasFermer(-5000)) && A.pourquoiPasFermer(0) === null);
}

console.log('\n6. L\'écran, la règle et la page parlent des mêmes choses');
{
  const ecran = lire('app/avance-de-travail-ecran.js');
  const html = lire('app/gestion.html');
  const livreur = lire('app/livreur.html');
  verifier('la règle ne touche ni au DOM ni à la base', !/document\.|supabaseClient/.test(lire('app/avance-de-travail.js')));
  verifier('l\'écran appelle les trois fonctions de la base', ['avances_de_travail_soldes', 'avance_de_travail_mouvement', 'avance_de_travail_fermer'].every((f) => ecran.includes(f)));
  verifier('la carte vit sous la caisse des livreurs, pas dans un écran de plus', html.includes('id="adt-carte"') && html.indexOf('id="adt-carte"') > html.indexOf('id="caisse-table"'));
  verifier('les deux fichiers sont chargés par Gestion', html.includes('avance-de-travail.js?v=') && html.includes('avance-de-travail-ecran.js?v='));
  verifier('donner, reprendre, corriger et fermer sont réservés à l\'administrateur', /estAdmin\(\)/.test(ecran) && /window\.ACCES/.test(ecran) && /window\.ACCES = ACCES/.test(lire('app/gestion.js')));
  verifier('le livreur voit la sienne sur son écran', livreur.includes('mon-avance-de-travail') && livreur.includes('renderMonAvanceDeTravail'));
  verifier('et il la lit seulement : aucun geste d\'écriture de son côté', !/avance_de_travail_mouvement|avance_de_travail_fermer/.test(livreur));
  verifier('aucune fenêtre du navigateur : la saisie se fait dans la page', !/\bprompt\(|\bwindow\.confirm\(/.test(ecran));
  verifier('le plafond et le minimum du motif sont ceux de la base', A.PLAFOND === 5000000 && A.MOTIF_MINI === 10);
}

console.log('\n7. La migration : la règle du serveur apprend les mêmes colonnes');
{
  const f = path.join(RACINE, '_sql-prive/2026-09-22-le-point-du-livreur.sql');
  if (!fs.existsSync(f)) console.log('   (_sql-prive absent de ce dépôt : contrôles sautés, ils tournent sur le Mac)');
  else {
    const m = lire('_sql-prive/2026-09-22-le-point-du-livreur.sql');
    verifier('la colonne du remboursement au livreur, en add column if not exists', /add column if not exists frais_additionnels_rembourse_at/.test(m));
    verifier('la règle d\'argent du serveur retranche les frais additionnels non rendus',
      /frais_additionnels_rembourse_at is null[\s\S]{0,120}frais_additionnels_montant/.test(m));
    verifier('le montant attendu du soir les compte aussi', /attendu_remise_caisse[\s\S]*frais_additionnels_rembourse_at is null/.test(m));
    verifier('la remise du soir pose les DEUX dates', /enregistrer_remise_caisse[\s\S]*frais_additionnels_rembourse_at = case when/.test(m));
    verifier('les dépenses de l\'avance sont écrites par la base, pas à la main', /create trigger colis_avance_de_travail/.test(m) && /genre not in \('dotation', 'remboursement', 'correction'\)/.test(m));
    verifier('le déclencheur écrit la DIFFÉRENCE, pas le montant', /v_delta := v_apres - v_avant/.test(m));
    verifier('la table est sous règle de lecture, et personne n\'y écrit directement',
      /alter table public\.avances_de_travail enable row level security/.test(m)
      && /revoke insert, update, delete on public\.avances_de_travail from anon, authenticated/.test(m));
    verifier('administrateur seul pour poser, reprendre et fermer', (m.match(/is distinct from 'admin'/g) || []).length === 2);
    verifier('la migration s\'enregistre au registre', /migration_appliquee\('2026-09-22-le-point-du-livreur\.sql'/.test(m));
  }
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
process.exit(echouees ? 1 : 0);
