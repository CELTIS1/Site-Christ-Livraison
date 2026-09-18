/* LES QUESTIONS QU'ON SE POSE VRAIMENT — Gestion › Tableau de bord — 18 septembre 2026
   ==========================================================================================
   Celtis : « l'espace ou l'interface que tu m'as faite pour l'analyse des données, je veux
   pouvoir interagir, interroger, et avoir des réponses claires et précises pour une gestion
   optimale. S'il faut une IA intégrée alors on optera pour la plus accessible car j'ai
   énormément de charges et d'abonnements. N'hésite pas à me proposer mieux. »

   CE QU'ON A PROPOSÉ DE MIEUX, ET POURQUOI.

   Une IA est mauvaise exactement là où il a besoin de précision : l'arithmétique sur ses
   données. Un modèle qui additionne 1 523 colis se trompe, et il se trompe avec aplomb. Sur de
   l'argent, c'est le pire défaut possible — cette application a passé la journée du 18 à faire
   corriger des écrans qui annonçaient deux chiffres différents pour le même colis.

   Or les vraies questions d'une entreprise de livraison sont DÉNOMBRABLES. Quelle cliente a
   baissé, laquelle est partie sans le dire, quel livreur se dégrade, qui détient mon argent,
   où part-il, quelle commune rapporte. Une douzaine, pas mille. On les calcule donc
   exactement — gratuit, instantané, sans clé ni facture, et incapable d'inventer un nombre.

   Décision de Celtis le 18/09 : le catalogue d'abord, et on rediscute du texte libre en
   octobre, quand deux semaines d'usage auront dit s'il manque vraiment. Si l'on y vient, le
   modèle ne fera que DEUX choses — comprendre laquelle de ces questions est posée, et tourner
   la phrase. Les chiffres viendront toujours d'ici.

   LES QUATRE RÈGLES DE CE FICHIER
   ------------------------------
   1. AUCUN CALCUL D'ARGENT N'EST REFAIT ICI. montantNetADevoir(), caisseParLivreur(),
      totauxArgent() — ce sont celles que le livreur, la cliente et la comptabilité lisent déjà.
      Un second calcul, même juste le premier jour, finirait par diverger.
   2. UNE RÉPONSE DIT SON CHEMIN. « Awa Boutique a baissé » n'apprend rien ; « Awa Boutique :
      31 colis ce mois contre 52 le mois dernier, −40 % » se vérifie. Chaque réponse porte donc
      les nombres qui la fondent, et l'écran les montre.
   3. ON NE RÉPOND PAS QUAND ON NE SAIT PAS. Pas de comparaison possible, base trop petite,
      historique trop court : la réponse le dit. Une question qui rend un chiffre faux plutôt
      que « je ne sais pas » est pire qu'une question absente — elle fait décider.
   4. AUCUN DOCUMENT, AUCUNE BASE. Des données entrent, des réponses sortent. C'est ce qui rend
      ces treize questions vérifiables hors navigateur, et donc réellement vérifiées.
   ========================================================================================== */
(function () {
  'use strict';

  const R = () => window.CLTCeQuiAChange;

  const F = (n) => (typeof formatMontant === 'function' ? formatMontant(n) : String(n)) || '0 FCFA';
  const nb = (n) => String(Number(n) || 0);
  const pct = (n) => (n === null || n === undefined ? '—' : n + ' %');

  // Le nom d'une personne, tel qu'on l'appelle. Jamais un identifiant : une réponse qui dit
  // « bbbbbbbb-bbbb-4bbb… a baissé » n'est pas une réponse.
  function nomDe(profils, id) {
    const p = (profils || []).find((x) => x && x.id === id);
    if (!p) return 'Cliente inconnue';
    return String(p.company_name || p.full_name || '').trim() || 'Sans nom';
  }

  const jourDuSort = (c) => c && (c.livre_at || c.non_livre_at || c.retour_at || null);
  const estFixe = (c) => c && (c.statut === 'livre' || c.statut === 'non_livre' || c.statut === 'retour');

  // Les colis d'un mois, selon la date qui convient à la question posée.
  function duMois(colis, mois, quelleDate) {
    const A = R();
    return (colis || []).filter((c) => A.cleDuMois(quelleDate === 'sort' ? jourDuSort(c) : c.created_at) === mois);
  }

  function parCle(liste, cle) {
    const m = {};
    (liste || []).forEach((c) => {
      const k = typeof cle === 'function' ? cle(c) : c[cle];
      if (!k) return;
      (m[k] = m[k] || []).push(c);
    });
    return m;
  }

  /* Une réponse. `titre` est la phrase principale — celle qu'on lit en dix secondes ; `lignes`
     le chemin des chiffres ; `note` ce qu'il faut savoir pour ne pas se tromper en la lisant. */
  const rep = (titre, lignes, note) => ({ titre: titre, lignes: lignes || [], note: note || '' });
  const jeNeSaisPas = (pourquoi) => ({ titre: '', lignes: [], note: '', jeNeSaisPas: pourquoi });

  /* --------------------------------------------------------------------------------------
     LE CATALOGUE
     --------------------------------------------------------------------------------------
     `mots` sert à retrouver une question à partir de quelques mots tapés — par simple
     correspondance, sans aucun modèle. C'est volontairement bête et ça marche : on cherche
     « baisse », « partie », « argent », pas des tournures.
     -------------------------------------------------------------------------------------- */
  const QUESTIONS = [

    /* ---------- LES CLIENTES ---------- */
    {
      id: 'cliente-baisse', groupe: 'Mes clientes',
      titre: 'Quelle cliente a le plus baissé ce mois-ci ?',
      mots: 'cliente baisse baissé recule chute moins colis perdu vendeuse fournisseur',
      repondre: function (d, mois) {
        const A = R();
        const avant = A.moisPrecedent(mois);
        const ce = parCle(duMois(d.colis, mois, 'creation'), 'fournisseur_id');
        const pre = parCle(duMois(d.colis, avant, 'creation'), 'fournisseur_id');
        // On ne juge que celles qui avaient un volume réel : passer de 2 à 1 colis n'est pas une
        // baisse, c'est du hasard. Cinq, c'est le même plancher que partout ailleurs.
        const lignes = Object.keys(pre).filter((id) => pre[id].length >= 5).map(function (id) {
          const a = pre[id].length;
          const b = (ce[id] || []).length;
          return { id: id, nom: nomDe(d.profils, id), avant: a, maintenant: b,
            ecart: b - a, pct: Math.round(((b - a) / a) * 100) };
        }).filter((l) => l.ecart < 0).sort((x, y) => x.pct - y.pct);
        if (!lignes.length) return jeNeSaisPas('Aucune cliente qui avait au moins 5 colis le mois dernier n\'a baissé ce mois-ci. C\'est une bonne nouvelle, pas une absence de réponse.');
        const p = lignes[0];
        return rep(
          p.nom + ' : ' + nb(p.maintenant) + ' colis ce mois contre ' + nb(p.avant) + ' le mois dernier (' + A.pourcentEnClair(p.pct) + ')',
          lignes.slice(0, 8).map((l) => ({ quoi: l.nom, valeur: nb(l.maintenant) + ' contre ' + nb(l.avant), note: A.pourcentEnClair(l.pct) })),
          'Comptées au jour où le colis a été confié. Seules les clientes qui avaient au moins 5 colis le mois dernier sont jugées : en dessous, un écart ne veut rien dire.');
      },
    },
    {
      id: 'cliente-partie', groupe: 'Mes clientes',
      titre: 'Qui ne m\'a rien confié depuis trois semaines ?',
      mots: 'cliente partie perdue silence plus rien disparue abandonne quitte inactive',
      repondre: function (d, mois) {
        const A = R();
        void mois;
        // Le dernier colis de chacune, et depuis combien de jours. On ne juge que celles qui
        // avaient une habitude : trois colis au moins, sinon une cliente d'essai ressort comme
        // une cliente perdue.
        const tout = parCle(d.colis, 'fournisseur_id');
        const aujourdHui = d.aujourdHui || A.cleDuMois(new Date().toISOString()) + '-15';
        const jours = (iso) => Math.round((new Date(aujourdHui) - new Date(iso)) / 86400000);
        const lignes = Object.keys(tout).filter((id) => tout[id].length >= 3).map(function (id) {
          const dates = tout[id].map((c) => c.created_at).filter(Boolean).sort();
          const dernier = dates[dates.length - 1];
          return { nom: nomDe(d.profils, id), total: tout[id].length, dernier: dernier, jours: jours(dernier) };
        }).filter((l) => l.jours >= 21).sort((x, y) => y.jours - x.jours);
        if (!lignes.length) return jeNeSaisPas('Aucune cliente ayant confié au moins 3 colis n\'est silencieuse depuis 21 jours.');
        return rep(
          lignes.length === 1
            ? lignes[0].nom + ' n\'a rien confié depuis ' + nb(lignes[0].jours) + ' jours'
            : nb(lignes.length) + ' clientes n\'ont rien confié depuis plus de trois semaines',
          lignes.slice(0, 10).map((l) => ({ quoi: l.nom, valeur: nb(l.jours) + ' jours',
            note: nb(l.total) + ' colis au total, dernier le ' + String(l.dernier).slice(0, 10) })),
          'Seules les clientes qui avaient confié au moins 3 colis sont comptées : en dessous, on ne peut pas parler d\'habitude perdue. Un appel suffit souvent à savoir pourquoi.');
      },
    },
    {
      id: 'cliente-monte', groupe: 'Mes clientes',
      titre: 'Quelle cliente monte le plus ?',
      mots: 'cliente monte hausse augmente progresse plus meilleure croissance',
      repondre: function (d, mois) {
        const A = R();
        const avant = A.moisPrecedent(mois);
        const ce = parCle(duMois(d.colis, mois, 'creation'), 'fournisseur_id');
        const pre = parCle(duMois(d.colis, avant, 'creation'), 'fournisseur_id');
        const lignes = Object.keys(ce).map(function (id) {
          const b = ce[id].length;
          const a = (pre[id] || []).length;
          return { nom: nomDe(d.profils, id), avant: a, maintenant: b, ecart: b - a,
            pct: a >= 5 ? Math.round(((b - a) / a) * 100) : null, nouvelle: a === 0 };
        }).filter((l) => l.ecart > 0).sort((x, y) => y.ecart - x.ecart);
        if (!lignes.length) return jeNeSaisPas('Aucune cliente n\'a confié plus de colis ce mois-ci que le mois dernier.');
        const p = lignes[0];
        return rep(
          p.nom + ' : ' + nb(p.maintenant) + ' colis ce mois contre ' + nb(p.avant) + ' le mois dernier'
            + (p.pct !== null ? ' (' + A.pourcentEnClair(p.pct) + ')' : ''),
          lignes.slice(0, 8).map((l) => ({ quoi: l.nom + (l.nouvelle ? ' (nouvelle)' : ''),
            valeur: nb(l.maintenant) + ' contre ' + nb(l.avant),
            note: l.pct !== null ? A.pourcentEnClair(l.pct) : '+' + nb(l.ecart) + ' colis' })),
          'Le pourcentage n\'est donné que si la cliente avait au moins 5 colis le mois dernier ; sinon c\'est l\'écart en colis, qui ne trompe pas.');
      },
    },
    {
      id: 'cliente-echecs', groupe: 'Mes clientes',
      titre: 'Chez quelle cliente les livraisons échouent le plus ?',
      mots: 'cliente echec echecs rate non livre probleme adresse mauvais',
      repondre: function (d, mois) {
        const fixes = duMois(d.colis, mois, 'sort').filter(estFixe);
        const par = parCle(fixes, 'fournisseur_id');
        const lignes = Object.keys(par).filter((id) => par[id].length >= 5).map(function (id) {
          const l = par[id];
          const ech = l.filter((c) => c.statut !== 'livre').length;
          return { nom: nomDe(d.profils, id), fixes: l.length, echecs: ech,
            taux: Math.round((ech / l.length) * 100) };
        }).filter((l) => l.echecs > 0).sort((x, y) => y.taux - x.taux);
        if (!lignes.length) return jeNeSaisPas('Aucune cliente avec au moins 5 colis terminés ce mois-ci n\'a d\'échec. Rien à signaler.');
        const p = lignes[0];
        return rep(
          p.nom + ' : ' + nb(p.echecs) + ' échecs sur ' + nb(p.fixes) + ' colis terminés (' + p.taux + ' %)',
          lignes.slice(0, 8).map((l) => ({ quoi: l.nom, valeur: nb(l.echecs) + ' / ' + nb(l.fixes), note: l.taux + ' %' })),
          'Comptés au jour où le sort du colis a été fixé. Un taux d\'échec élevé chez une cliente vient souvent des adresses qu\'elle donne, pas du livreur : c\'est une conversation à avoir avec elle.');
      },
    },
    {
      id: 'cliente-due', groupe: 'Mes clientes',
      titre: 'À qui je dois de l\'argent, et depuis quand ?',
      mots: 'dois argent reverser reversement dette due clientes doit combien',
      repondre: function (d) {
        if (typeof montantNetADevoir !== 'function') return jeNeSaisPas('Le calcul de l\'argent n\'est pas chargé sur cet écran.');
        const A = R();
        const aujourdHui = d.aujourdHui || A.cleDuMois(new Date().toISOString()) + '-15';
        const jours = (iso) => Math.round((new Date(aujourdHui) - new Date(iso)) / 86400000);
        // Toutes dates, et non le mois choisi : une dette ne se range pas dans un mois.
        const aPayer = (d.colis || []).filter((c) => !c.reverse_au_fournisseur_at && montantNetADevoir(c) !== 0);
        const par = parCle(aPayer, 'fournisseur_id');
        const lignes = Object.keys(par).map(function (id) {
          const l = par[id];
          const total = l.reduce((s, c) => s + montantNetADevoir(c), 0);
          const plusVieux = l.map((c) => c.created_at).filter(Boolean).sort()[0];
          return { nom: nomDe(d.profils, id), total: total, nbColis: l.length,
            jours: plusVieux ? jours(plusVieux) : null };
        }).filter((l) => l.total !== 0).sort((x, y) => y.total - x.total);
        if (!lignes.length) return jeNeSaisPas('Vous ne devez rien à personne : tout est reversé.');
        const somme = lignes.reduce((s, l) => s + l.total, 0);
        const vieille = lignes.slice().sort((x, y) => (y.jours || 0) - (x.jours || 0))[0];
        return rep(
          F(somme) + ' à reverser, à ' + nb(lignes.length) + ' cliente' + (lignes.length > 1 ? 's' : '')
            + (vieille && vieille.jours >= 3 ? ' — la plus ancienne attend depuis ' + nb(vieille.jours) + ' jours' : ''),
          lignes.slice(0, 12).map((l) => ({ quoi: l.nom, valeur: F(l.total),
            note: nb(l.nbColis) + ' colis' + (l.jours !== null ? ', le plus ancien il y a ' + nb(l.jours) + ' jours' : '') })),
          'Le net par colis, retenues faites (frais de gare, frais de course, frais additionnels) — le même calcul que le relevé du soir. Un montant négatif veut dire que c\'est ELLE qui vous doit.');
      },
    },

    /* ---------- LES LIVREURS ---------- */
    {
      id: 'livreur-degrade', groupe: 'Mes livreurs',
      titre: 'Quel livreur se dégrade ?',
      mots: 'livreur degrade baisse taux reussite echec probleme moins bon',
      repondre: function (d, mois) {
        const A = R();
        // Les décomptes de primes gardent le taux de CHAQUE livreur pour CHAQUE mois, figés à la
        // clôture. C'est la seule série longue de la base, et personne ne l'avait jamais lue.
        const par = parCle(d.decomptes, 'salarie_id');
        const lignes = Object.keys(par).map(function (id) {
          const serie = A.serieMensuelle(par[id], (x) => String(x.periode || '').slice(0, 10),
            (l) => (l.length && l[0].taux_livraison !== null && l[0].taux_livraison !== undefined ? Number(l[0].taux_livraison) : null),
            mois, 12);
          return { nom: nomDe(d.profils, id), serie: serie, pente: A.pente(serie, { planche: 1, seuilPct: 5 }) };
        }).filter((l) => l.pente.sens === 'baisse').sort((x, y) => x.pente.ampleur - y.pente.ampleur);
        if (!Object.keys(par).length) {
          return jeNeSaisPas('Aucun décompte de primes n\'est encore clôturé : le taux mensuel de chaque livreur n\'existe donc pas en série. Il apparaîtra après la première clôture.');
        }
        if (!lignes.length) return jeNeSaisPas('Aucun livreur n\'est en baisse sur trois mois consécutifs. Il faut trois mois pour parler de dégradation — un mauvais mois isolé arrive.');
        const p = lignes[0];
        return rep(
          p.nom + ' : en baisse depuis ' + nb(p.pente.pas) + ' mois — ' + A.cheminDeLaPente(p.serie, p.pente, pct),
          lignes.map((l) => ({ quoi: l.nom, valeur: A.cheminDeLaPente(l.serie, l.pente, pct),
            note: nb(l.pente.pas) + ' mois de baisse' })),
          'Lu dans les décomptes de primes, qui gardent le taux figé de chaque mois. Une dégradation se voit à la PENTE, pas au niveau : un livreur qui passe de 99 % à 85 % est encore au-dessus du seuil d\'alerte, et c\'est pourtant le moment de lui parler.');
      },
    },
    {
      id: 'livreur-rythme', groupe: 'Mes livreurs',
      titre: 'Qui livre le plus, et le moins, par jour travaillé ?',
      mots: 'livreur rythme moyenne par jour rapide lent combien livraisons productivite',
      repondre: function (d, mois) {
        const A = R();
        const livres = duMois(d.colis, mois, 'sort').filter((c) => c.statut === 'livre');
        const par = parCle(livres, 'livreur_id');
        const lignes = Object.keys(par).map(function (id) {
          const l = par[id];
          const jours = new Set(l.map((c) => A.cleDuMois(jourDuSort(c)) + String(jourDuSort(c)).slice(7, 10))).size;
          return { nom: nomDe(d.profils, id), livres: l.length, jours: jours,
            moyenne: jours ? Math.round((l.length / jours) * 10) / 10 : null };
        }).filter((l) => l.moyenne !== null).sort((x, y) => y.moyenne - x.moyenne);
        // MÊME PLANCHER QUE PARTOUT : un livreur qui a livré un seul jour a « 9 colis par jour »,
        // ce qui est vrai et ne veut rien dire. Trois jours au moins, sinon on ne le classe pas —
        // un rythme se mesure sur une habitude, pas sur une journée.
        const assez = lignes.filter((l) => l.jours >= 3);
        if (!lignes.length) return jeNeSaisPas('Aucun colis livré ce mois-ci : il n\'y a pas de rythme à mesurer.');
        if (!assez.length) {
          return jeNeSaisPas('Aucun livreur n\'a livré sur au moins 3 jours différents ce mois-ci : sur un ou deux jours, une moyenne par jour ne veut rien dire.');
        }
        const haut = assez[0];
        const bas = assez[assez.length - 1];
        return rep(
          haut.nom + ' : ' + haut.moyenne + ' colis par jour travaillé'
            + (assez.length > 1 ? ' · ' + bas.nom + ' : ' + bas.moyenne : ''),
          assez.map((l) => ({ quoi: l.nom, valeur: l.moyenne + ' / jour',
            note: nb(l.livres) + ' livrés sur ' + nb(l.jours) + ' jours travaillés' })),
          'Les jours travaillés sont les jours où le livreur a réellement livré, pas les jours du calendrier : un livreur qui livre beaucoup en trois jours n\'est pas moins bon qu\'un autre étalé sur vingt. Les livreurs ayant livré moins de 3 jours ne sont pas classés : leur moyenne ne voudrait rien dire.');
      },
    },
    {
      id: 'livreur-argent', groupe: 'Mes livreurs',
      titre: 'Qui détient de mon argent, et depuis combien de jours ?',
      mots: 'livreur argent caisse detient garde remettre remise reste combien',
      repondre: function (d) {
        if (typeof caisseParLivreur !== 'function') return jeNeSaisPas('Le calcul de la caisse n\'est pas chargé sur cet écran.');
        const A = R();
        const aujourdHui = d.aujourdHui || A.cleDuMois(new Date().toISOString()) + '-15';
        const jours = (iso) => Math.round((new Date(aujourdHui) - new Date(iso)) / 86400000);
        // Toutes dates : l'argent en main ne se range pas dans un mois. C'est l'addition de la
        // maison qui répond — la même que le point du jour et que l'écran du livreur.
        const caisse = caisseParLivreur(d.colis);
        const lignes = (caisse.lignes || caisse || []).filter ? (caisse.lignes || []) : [];
        const brut = Array.isArray(caisse) ? caisse : (caisse.lignes || Object.keys(caisse).map((k) => caisse[k]));
        void lignes;
        const sorties = (Array.isArray(brut) ? brut : []).filter((l) => l && Number(l.reste) > 0)
          .map(function (l) {
            const sesColis = (d.colis || []).filter((c) => c.livreur_id === l.livreurId || c.livreur_id === l.id);
            const plusVieux = sesColis.map(jourDuSort).filter(Boolean).sort()[0];
            return { nom: nomDe(d.profils, l.livreurId || l.id), reste: Number(l.reste),
              nbColis: Number(l.nb) || 0, jours: plusVieux ? jours(plusVieux) : null };
          }).sort((x, y) => y.reste - x.reste);
        if (!sorties.length) return jeNeSaisPas('Aucun livreur ne détient d\'argent : tout a été remis.');
        const somme = sorties.reduce((s, l) => s + l.reste, 0);
        return rep(
          F(somme) + ' encore chez ' + nb(sorties.length) + ' livreur' + (sorties.length > 1 ? 's' : ''),
          sorties.map((l) => ({ quoi: l.nom, valeur: F(l.reste),
            note: nb(l.nbColis) + ' colis' + (l.jours !== null ? ', le plus ancien il y a ' + nb(l.jours) + ' jours' : '') })),
          'Ce qui est entré dans sa poche moins ce qu\'il a déjà remis — la même addition que son écran et que le point du jour. Au-delà de deux jours, l\'argent dort.');
      },
    },

    /* ---------- L'ARGENT ET L'ACTIVITÉ ---------- */
    {
      id: 'argent-mois', groupe: 'Mon argent',
      titre: 'Combien j\'ai gagné ce mois contre le mois dernier ?',
      mots: 'gagne gagné recette argent mois chiffre affaires revenu combien benefice',
      repondre: function (d, mois) {
        if (typeof totauxArgent !== 'function') return jeNeSaisPas('Le calcul de l\'argent n\'est pas chargé sur cet écran.');
        const A = R();
        const avant = A.moisPrecedent(mois);
        /* AVANT LE PREMIER COLIS, IL N'Y A PAS « 0 FCFA » : il n'y a rien. C'est la même
           frontière que les séries de la console (ce-qui-a-change.js), et elle a été posée le
           18/09 après avoir vu douze mois de zéros inventés sur un écran qui n'avait que deux
           mois d'histoire. Un zéro se lit comme un résultat ; l'absence se lit comme une
           absence. En revanche, une fois l'activité commencée, un mois à 0 est un vrai 0 —
           c'est même une réponse importante. */
        const sortsConnus = (d.colis || []).map(jourDuSort).filter(Boolean).sort();
        if (!sortsConnus.length || A.cleDuMois(sortsConnus[0]) > mois) {
          return jeNeSaisPas('Aucun colis n\'a encore été terminé jusqu\'à ' + A.moisEnClair(mois)
            + '. Ce n\'est pas « 0 FCFA de recette » : il n\'y a rien à compter sur cette période.');
        }
        const t = (m) => totauxArgent(duMois(d.colis, m, 'sort'));
        const ce = t(mois);
        const pre = t(avant);
        const c = A.comparer(Number(ce.recetteLivraison) || 0, Number(pre.recetteLivraison) || 0, { planche: 1 });
        const v = A.verdictDuChangement({ nom: 'Recette', comparaison: c, formater: F });
        return rep(
          F(ce.recetteLivraison) + ' de recette de livraison — ' + v.phrase,
          [
            { quoi: 'Recette de livraison (à vous)', valeur: F(ce.recetteLivraison), note: F(pre.recetteLivraison) + ' le mois d\'avant' },
            { quoi: 'Articles encaissés (aux clientes)', valeur: F(ce.articleEncaisse), note: F(pre.articleEncaisse) + ' le mois d\'avant' },
            { quoi: 'Colis livrés', valeur: nb(ce.nbLivres), note: nb(pre.nbLivres) + ' le mois d\'avant' },
            { quoi: 'Encore à reverser aux clientes', valeur: F(ce.netADevoir), note: 'sur les colis de ce mois' },
          ],
          'La recette de livraison est l\'argent de CLT. Les articles encaissés appartiennent aux clientes et doivent leur être reversés : ils ne sont jamais un gain. Comptés au jour où le sort du colis a été fixé.');
      },
    },
    {
      id: 'argent-depenses', groupe: 'Mon argent',
      titre: 'Où part mon argent ?',
      mots: 'depenses depense part sort charges couts frais ou part argent categorie',
      repondre: function (d, mois) {
        const A = R();
        const avant = A.moisPrecedent(mois);
        const duMoisSaisi = (m) => (d.depenses || []).filter((x) =>
          (String(x.annee) + '-' + String(x.mois).padStart(2, '0')) === m);
        const ce = duMoisSaisi(mois);
        const pre = duMoisSaisi(avant);
        if (!ce.length) return jeNeSaisPas('Aucune dépense n\'est saisie pour ' + A.moisEnClair(mois) + '. Ce n\'est pas « zéro dépense » : c\'est une saisie qui reste à faire, en Comptabilité › Dépenses.');
        const somme = (l) => l.reduce((s, x) => s + (Number(x.montant) || 0), 0);
        const parCat = {};
        ce.forEach((x) => { const k = x.categorie || 'Sans catégorie'; parCat[k] = (parCat[k] || 0) + (Number(x.montant) || 0); });
        const parCatAvant = {};
        pre.forEach((x) => { const k = x.categorie || 'Sans catégorie'; parCatAvant[k] = (parCatAvant[k] || 0) + (Number(x.montant) || 0); });
        const lignes = Object.keys(parCat).sort((a, b) => parCat[b] - parCat[a]).map(function (k) {
          const a = parCatAvant[k];
          const cmp = A.comparer(parCat[k], a === undefined ? null : a, { planche: 1 });
          return { quoi: k, valeur: F(parCat[k]),
            note: cmp.connu ? (A.pourcentEnClair(cmp.pct) || A.ecartEnClair(cmp)) + ' vs le mois d\'avant' : 'rien de comparable le mois d\'avant' };
        });
        const total = somme(ce);
        const plus = lignes[0];
        return rep(
          F(total) + ' de dépenses, dont ' + plus.valeur + ' en « ' + plus.quoi + ' »',
          lignes, 'Tel que c\'est saisi en Comptabilité › Dépenses. Un mois non saisi n\'apparaît pas comme zéro : il n\'apparaît pas du tout.');
      },
    },
    {
      id: 'commune-rapporte', groupe: 'Mon activité',
      titre: 'Quelle commune me rapporte le plus ?',
      mots: 'commune quartier zone rapporte recette meilleure ou livre plus',
      repondre: function (d, mois) {
        if (typeof totauxArgent !== 'function') return jeNeSaisPas('Le calcul de l\'argent n\'est pas chargé sur cet écran.');
        const fixes = duMois(d.colis, mois, 'sort').filter(estFixe);
        const par = parCle(fixes, (c) => c.commune_destination || 'Sans commune');
        const lignes = Object.keys(par).map(function (k) {
          const t = totauxArgent(par[k]);
          return { quoi: k, recette: Number(t.recetteLivraison) || 0, nb: par[k].length, livres: t.nbLivres };
        }).sort((x, y) => y.recette - x.recette);
        if (!lignes.length) return jeNeSaisPas('Aucun colis terminé ce mois-ci.');
        const p = lignes[0];
        return rep(
          p.quoi + ' : ' + F(p.recette) + ' de recette sur ' + nb(p.livres) + ' colis livrés',
          lignes.slice(0, 12).map((l) => ({ quoi: l.quoi, valeur: F(l.recette),
            note: nb(l.livres) + ' livrés sur ' + nb(l.nb) + ' terminés' })),
          'La recette de livraison, commune d\'ARRIVÉE. Une commune qui rapporte peu peut simplement être peu demandée : lisez le nombre de colis à côté du montant.');
      },
    },
    {
      id: 'commune-echecs', groupe: 'Mon activité',
      titre: 'Quelle commune me coûte le plus en échecs ?',
      mots: 'commune echec echecs rate cher coute perdu deplacement pour rien',
      repondre: function (d, mois) {
        const fixes = duMois(d.colis, mois, 'sort').filter(estFixe);
        const par = parCle(fixes, (c) => c.commune_destination || 'Sans commune');
        const lignes = Object.keys(par).filter((k) => par[k].length >= 5).map(function (k) {
          const ech = par[k].filter((c) => c.statut !== 'livre').length;
          return { quoi: k, echecs: ech, total: par[k].length, taux: Math.round((ech / par[k].length) * 100) };
        }).filter((l) => l.echecs > 0).sort((x, y) => y.taux - x.taux);
        if (!lignes.length) return jeNeSaisPas('Aucune commune avec au moins 5 colis terminés n\'a d\'échec ce mois-ci.');
        const p = lignes[0];
        return rep(
          p.quoi + ' : ' + p.taux + ' % d\'échecs (' + nb(p.echecs) + ' sur ' + nb(p.total) + ')',
          lignes.slice(0, 10).map((l) => ({ quoi: l.quoi, valeur: l.taux + ' %',
            note: nb(l.echecs) + ' échecs sur ' + nb(l.total) + ' terminés' })),
          'Un déplacement qui échoue coûte le trajet sans rapporter la course. Au-delà de 5 colis seulement : en dessous, un taux ne veut rien dire.');
      },
    },
    {
      id: 'jour-charge', groupe: 'Mon activité',
      titre: 'Quel jour de la semaine est le plus chargé ?',
      mots: 'jour semaine charge lundi samedi pic quand plus colis organiser',
      repondre: function (d, mois) {
        const A = R();
        const NOMS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
        // Les trois derniers mois connus : un seul mois donne quatre ou cinq occurrences de chaque
        // jour, ce qui est trop peu pour distinguer une habitude d'un hasard.
        const trois = [mois, A.moisPrecedent(mois), A.moisPrecedent(A.moisPrecedent(mois))];
        const liste = (d.colis || []).filter((c) => trois.indexOf(A.cleDuMois(c.created_at)) >= 0);
        if (liste.length < 30) return jeNeSaisPas('Pas encore assez de colis sur trois mois pour distinguer une habitude d\'un hasard (' + nb(liste.length) + ' colis).');
        const parJour = [0, 0, 0, 0, 0, 0, 0];
        const joursVus = [{}, {}, {}, {}, {}, {}, {}];
        liste.forEach(function (c) {
          const dt = new Date(c.created_at);
          if (isNaN(dt.getTime())) return;
          const j = dt.getUTCDay();
          parJour[j]++;
          joursVus[j][String(c.created_at).slice(0, 10)] = true;
        });
        const lignes = NOMS.map(function (nom, j) {
          const occurrences = Object.keys(joursVus[j]).length;
          return { quoi: nom, total: parJour[j], occurrences: occurrences,
            moyenne: occurrences ? Math.round((parJour[j] / occurrences) * 10) / 10 : 0 };
        }).filter((l) => l.occurrences > 0).sort((x, y) => y.moyenne - x.moyenne);
        if (!lignes.length) return jeNeSaisPas('Aucune date lisible sur ces colis.');
        const p = lignes[0];
        return rep(
          'Le ' + p.quoi + ' : ' + p.moyenne + ' colis en moyenne',
          lignes.map((l) => ({ quoi: l.quoi, valeur: l.moyenne + ' colis',
            note: nb(l.total) + ' colis sur ' + nb(l.occurrences) + ' ' + l.quoi + 's' })),
          'Moyenne par occurrence du jour, sur les trois derniers mois — et non le total, qui favoriserait les jours simplement plus nombreux dans la période.');
      },
    },
  ];

  /* --------------------------------------------------------------------------------------
     RETROUVER UNE QUESTION À PARTIR DE QUELQUES MOTS
     --------------------------------------------------------------------------------------
     Sans aucun modèle, et c'est assumé : on tape « baisse », « argent », « partie », et la
     correspondance suffit. Les accents et la casse sont ignorés — personne ne tape « dégradé »
     avec son accent dans une case de recherche.
     -------------------------------------------------------------------------------------- */
  function aplatir(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function chercher(texte) {
    const mots = aplatir(texte).split(' ').filter((m) => m.length >= 3);
    if (!mots.length) return QUESTIONS.slice();
    return QUESTIONS.map(function (q) {
      const foin = aplatir(q.titre + ' ' + q.mots + ' ' + q.groupe);
      let score = 0;
      mots.forEach(function (m) { if (foin.indexOf(m) >= 0) score++; });
      return { q: q, score: score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.q);
  }

  function groupes() {
    const ordre = [];
    QUESTIONS.forEach(function (q) { if (ordre.indexOf(q.groupe) < 0) ordre.push(q.groupe); });
    return ordre.map((g) => ({ groupe: g, questions: QUESTIONS.filter((q) => q.groupe === g) }));
  }

  function repondre(id, d, mois) {
    const q = QUESTIONS.find((x) => x.id === id);
    if (!q) return jeNeSaisPas('Question inconnue.');
    try {
      return q.repondre(d || {}, mois);
    } catch (e) {
      // Une question qui tombe ne doit pas emporter l'écran, et surtout ne doit pas rendre un
      // chiffre douteux : elle dit qu'elle n'a pas pu répondre.
      return jeNeSaisPas('Cette question n\'a pas pu être calculée (' + (e && e.message ? e.message : 'erreur inconnue') + ').');
    }
  }

  window.CLTQuestions = { QUESTIONS: QUESTIONS, groupes: groupes, chercher: chercher, repondre: repondre, aplatir: aplatir };
})();
