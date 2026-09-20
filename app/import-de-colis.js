/* L'IMPORT D'UN FICHIER DE COLIS — la lecture (20 septembre 2026, « ensuite » n° 5)
   ==========================================================================================
   L'inventaire du 20/09 : les plateformes de vendeuses acceptent un fichier CSV ou Excel. Une
   cliente qui tient ses commandes dans un tableur recopiait chaque ligne à la main — trente
   colis, trente fois six champs.

   L'IMPORT NE CRÉE AUCUN COLIS. Il REMPLIT LE FORMULAIRE que la cliente connaît déjà — une ligne
   de saisie par ligne du fichier — et c'est elle qui relit et appuie sur « Enregistrer ». Tout
   ce qui protège une saisie à la main protège donc un import : le prix de livraison proposé par
   la grille, l'alerte de double saisie, les montants manquants, la file hors réseau, la clé qui
   empêche un colis d'exister deux fois. Un second chemin d'écriture aurait fini par en oublier un.

   CE FICHIER-CI NE FAIT QUE LIRE, et il est pur (ni DOM, ni base) : du texte ou des cellules en
   entrée, des lignes propres et des avertissements en sortie. Il est indulgent sur la forme
   (séparateur « ; » « , » ou tabulation, guillemets, accents, « 15 000 F », « +225 07… ») et
   strict sur le fond : une ligne sans commune reconnue ni destination n'est pas un colis, elle
   est IGNORÉE et on dit pourquoi — jamais devinée.
   ========================================================================================== */
(function () {
  'use strict';

  const LIGNES_MAXI = 60;   // au-delà, le formulaire devient illisible : on importe en plusieurs fois

  const sansAccents = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  /* Le CSV tel qu'il sort d'Excel, de Google Sheets ou d'un téléphone : séparateur deviné sur la
     première ligne, guillemets doublés, retours à la ligne dans une cellule, BOM en tête. */
  function lireCSV(texte) {
    const t = String(texte || '').replace(/^﻿/, '');
    const premiere = t.split(/\r?\n/)[0] || '';
    const compte = (c) => (premiere.match(new RegExp('\\' + c, 'g')) || []).length;
    const sep = compte(';') >= compte(',') && compte(';') >= compte('\t') ? (compte(';') ? ';' : ',') : (compte('\t') > compte(',') ? '\t' : ',');
    const lignes = [];
    let cellule = '', ligne = [], dansGuillemets = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (dansGuillemets) {
        if (c === '"' && t[i + 1] === '"') { cellule += '"'; i++; }
        else if (c === '"') dansGuillemets = false;
        else cellule += c;
      } else if (c === '"' && cellule === '') dansGuillemets = true;
      else if (c === sep) { ligne.push(cellule); cellule = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && t[i + 1] === '\n') i++;
        ligne.push(cellule); cellule = '';
        lignes.push(ligne); ligne = [];
      } else cellule += c;
    }
    if (cellule !== '' || ligne.length) { ligne.push(cellule); lignes.push(ligne); }
    // Les lignes vides sont GARDÉES : le rang annoncé à la cliente doit être celui de son tableur.
    return lignes.map((l) => l.map((x) => String(x).trim()));
  }

  /* Les en-têtes qu'on reconnaît. L'ordre des champs compte : « montant livraison » doit être
     essayé avant « montant », sinon il serait pris pour le prix de l'article. */
  const CHAMPS = [
    ['montantLivraison', ['frais de livraison', 'frais livraison', 'montant livraison', 'prix livraison', 'cout livraison', 'livraison']],
    ['telephone', ['telephone destinataire', 'telephone du destinataire', 'telephone', 'tel', 'numero', 'contact', 'phone', 'whatsapp', 'mobile']],
    ['commune', ['commune de destination', 'commune destination', 'commune', 'ville', 'zone']],
    ['destination', ['adresse de livraison', 'adresse livraison', 'adresse', 'destination', 'quartier', 'lieu', 'precision', 'repere']],
    ['montantArticle', ['montant article', 'prix article', 'montant de l article', 'prix de l article', 'montant', 'prix', 'somme', 'article prix', 'total']],
    ['description', ['description', 'designation', 'article', 'produit', 'contenu', 'colis', 'commande']],
    ['aLivrerAvant', ['a livrer avant le', 'a livrer avant', 'livrer avant', 'date limite', 'echeance']],
    ['nom', ['nom du destinataire', 'nom destinataire', 'destinataire', 'client', 'nom', 'acheteur', 'acheteuse']],
  ];

  function reconnaitreColonnes(entetes) {
    const index = {}, inconnues = [];
    (entetes || []).forEach(function (brut, i) {
      const e = sansAccents(brut);
      if (!e) return;
      const trouve = CHAMPS.find(function (c) { return index[c[0]] === undefined && c[1].some(function (mot) { return e === mot; }); })
        || CHAMPS.find(function (c) { return index[c[0]] === undefined && c[1].some(function (mot) { return e.indexOf(mot) !== -1; }); });
      if (trouve) index[trouve[0]] = i; else inconnues.push(String(brut));
    });
    return { index: index, inconnues: inconnues };
  }

  /* « 15 000 », « 15.000 », « 15,000 F », « 15000 FCFA » → 15000. Le franc CFA n'a pas de
     centimes : un point ou une virgule suivi de trois chiffres est un séparateur de milliers.
     Rend null quand ce n'est pas un montant — on ne transforme pas « offert » en 0. */
  function lireMontant(brut) {
    const t = String(brut == null ? '' : brut).replace(/f\s*cfa|fcfa|cfa|xof|frs?|f\b/gi, '').replace(/[\s  ]/g, '');
    if (t === '') return null;
    // L'ordre des deux essais compte : « 15.000 » est quinze mille, PAS « 15 » suivi de décimales
    // nulles. (Le banc l'a attrapé le jour même : 15 000 F seraient devenus 15 F.)
    let n;
    if (/^\d{1,3}([.,]\d{3})+$/.test(t)) n = Number(t.replace(/[.,]/g, ''));
    else if (/^\d+([.,]0{1,2})?$/.test(t)) n = Number(t.replace(/[.,]0{1,2}$/, ''));
    else return null;
    return Number.isFinite(n) && n >= 0 && n < 100000000 ? n : null;
  }

  /* Dix chiffres, comme on les compose à Abidjan. « +225 07 01 02 03 04 », « 225-0701020304 »,
     « 07.01.02.03.04 » → « 0701020304 ». Excel mange le zéro de tête : neuf chiffres le retrouvent. */
  function lireTelephone(brut) {
    let d = String(brut == null ? '' : brut).replace(/\D/g, '');
    if (d.length === 13 && d.indexOf('225') === 0) d = d.slice(3);
    if (d.length === 12 && d.indexOf('225') === 0) d = '0' + d.slice(3);
    if (d.length === 9) d = '0' + d;
    return { numero: d, valide: /^(0[157]|2[157])\d{8}$/.test(d) };
  }

  /* La commune : « Cocody », « cocody angré », « PORT BOUET », « Yop » pour les habituées.
     Rend le nom exact de la grille, ou '' — jamais la plus proche « à peu près ». */
  const SURNOMS = { yop: 'Yopougon', 'grand bassam': 'Grand-Bassam', bassam: 'Grand-Bassam', 'port bouet': 'Port-Bouët', treich: 'Treichville', adjame: 'Adjamé', attecoube: 'Attécoubé' };
  function lireCommune(brut, communes) {
    const t = sansAccents(brut);
    if (!t) return '';
    const liste = (communes || []).slice().sort(function (a, b) { return b.length - a.length; });
    const exacte = liste.find(function (c) { return sansAccents(c) === t; });
    if (exacte) return exacte;
    const dedans = liste.filter(function (c) { return (' ' + t + ' ').indexOf(' ' + sansAccents(c) + ' ') !== -1; });
    if (dedans.length === 1) return dedans[0];
    if (dedans.length > 1) return '';   // « de Cocody à Marcory » : deux communes, on ne choisit pas
    const surnom = Object.keys(SURNOMS).find(function (k) { return (' ' + t + ' ').indexOf(' ' + k + ' ') !== -1; });
    return surnom && liste.indexOf(SURNOMS[surnom]) !== -1 ? SURNOMS[surnom] : '';
  }

  /* « 25/09/2026 », « 25-09-26 », « 2026-09-25 » → « 2026-09-25 » ; le reste → ''. */
  function lireDate(brut) {
    const t = String(brut == null ? '' : brut).trim();
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
    if (!m) return '';
    const a = m[3].length === 2 ? '20' + m[3] : m[3], mo = m[2].padStart(2, '0'), j = m[1].padStart(2, '0');
    return (Number(mo) >= 1 && Number(mo) <= 12 && Number(j) >= 1 && Number(j) <= 31) ? a + '-' + mo + '-' + j : '';
  }

  /* DU TABLEAU AUX LIGNES DE SAISIE. `tableau` : des lignes de cellules, en-têtes en premier.
     Rend { lignes, ignorees, colonnes, inconnues, tropLong, erreur }. */
  function lignesAImporter(tableau, communes) {
    const vide = { lignes: [], ignorees: [], colonnes: {}, inconnues: [], tropLong: 0, erreur: '' };
    tableau = (tableau || []).map(function (l) { return (l || []).map(function (x) { return x == null ? '' : x; }); });
    while (tableau.length && !tableau[0].some(function (x) { return String(x).trim() !== ''; })) tableau.shift();
    if (tableau.filter(function (l) { return l.some(function (x) { return String(x).trim() !== ''; }); }).length < 2) return Object.assign(vide, { erreur: 'Le fichier est vide, ou ne contient que sa ligne de titres.' });
    const r = reconnaitreColonnes(tableau[0]);
    if (r.index.commune === undefined && r.index.destination === undefined) {
      return Object.assign(vide, { inconnues: r.inconnues, erreur: 'La première ligne doit porter les titres des colonnes, dont au moins « Commune » ou « Adresse ». Le modèle à télécharger montre la forme attendue.' });
    }
    const lignes = [], ignorees = [];
    tableau.slice(1).forEach(function (cellules, k) {
      const rang = k + 2;   // le numéro de ligne que la cliente voit dans son tableur
      if (!cellules.some(function (x) { return String(x).trim() !== ''; })) return;   // ligne vide : ni colis, ni reproche
      const lire = function (champ) { const i = r.index[champ]; return i === undefined ? '' : String(cellules[i] == null ? '' : cellules[i]).trim(); };
      const adresse = lire('destination');
      const commune = lireCommune(lire('commune'), communes) || (r.index.commune === undefined ? lireCommune(adresse, communes) : '');
      if (!commune && !adresse) { ignorees.push({ rang: rang, raison: 'ni commune ni adresse' }); return; }
      const avertissements = [];
      if (!commune) avertissements.push(lire('commune') ? 'commune « ' + lire('commune') + ' » non reconnue : à choisir' : 'commune à choisir');
      const tel = lireTelephone(lire('telephone'));
      if (lire('telephone') && !tel.valide) avertissements.push('téléphone à vérifier');
      if (!lire('telephone')) avertissements.push('pas de téléphone');
      const article = lireMontant(lire('montantArticle')), livraison = lireMontant(lire('montantLivraison'));
      if (lire('montantArticle') && article === null) avertissements.push('montant « ' + lire('montantArticle') + ' » illisible');
      if (lire('montantLivraison') && livraison === null) avertissements.push('frais de livraison illisibles');
      const avant = lireDate(lire('aLivrerAvant'));
      if (lire('aLivrerAvant') && !avant) avertissements.push('date « ' + lire('aLivrerAvant') + ' » illisible');
      const nom = lire('nom');
      lignes.push({
        rang: rang, commune: commune,
        // Le nom du destinataire n'a pas de champ à lui : il va en tête de l'adresse, là où le livreur le lira.
        destination: [nom, adresse].filter(Boolean).join(' — '),
        telephone: tel.numero, montantArticle: article, montantLivraison: livraison,
        description: lire('description'), aLivrerAvant: avant, avertissements: avertissements,
      });
    });
    const tropLong = Math.max(0, lignes.length - LIGNES_MAXI);
    return { lignes: lignes.slice(0, LIGNES_MAXI), ignorees: ignorees, colonnes: r.index, inconnues: r.inconnues, tropLong: tropLong, erreur: lignes.length ? '' : 'Aucune ligne du fichier ne ressemble à un colis.' };
  }

  const MODELE_CSV = '﻿Commune;Adresse;Téléphone;Montant article;Description;Nom du destinataire;À livrer avant le\r\n'
    + 'Cocody;Riviera 3, immeuble Alpha, 2e étage;0701020304;15000;Robe wax taille M;Mme Kouassi;\r\n'
    + 'Yopougon;Niangon Nord, pharmacie du carrefour;0505060708;8500;Parfum 50 ml;Awa;25/09/2026\r\n';

  window.CLTImportColis = { LIGNES_MAXI: LIGNES_MAXI, lireCSV: lireCSV, reconnaitreColonnes: reconnaitreColonnes, lireMontant: lireMontant,
    lireTelephone: lireTelephone, lireCommune: lireCommune, lireDate: lireDate, lignesAImporter: lignesAImporter, MODELE_CSV: MODELE_CSV };
})();
