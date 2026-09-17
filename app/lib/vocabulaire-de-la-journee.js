/* ==========================================================================================
   LE MÊME MOT POUR LA MÊME CHOSE — point 9.4, 17 septembre 2026
   ==========================================================================================
   MESURÉ AVANT DE TOUCHER AUX MOTS. Cinq colis dans une base d'essai, l'écran du livreur
   ouvert : sa carte de la journée affichait, AU MÊME INSTANT,

       les tuiles   →  « 1 Pas encore pris · 1 En cours »
       la ligne au-dessus des tuiles  →  « 2 en cours »

   Le colis pas encore récupéré était compté « en cours » par la ligne et « pas encore pris »
   par la tuile d'à côté. Deux chiffres, deux sens, un centimètre d'écart. Et chez la cliente,
   « En cours » ne comptait QUE les colis en livraison — ni l'un ni l'autre des deux sens du
   livreur. Trois définitions pour deux mots, sur trois écrans qui se parlent au téléphone.

   D'OÙ VENAIT LA DÉRIVE : chaque écran recomptait de son côté, avec ses propres statuts écrits
   à la main. Tant que le compte est recopié, il se sépare — c'est une question de temps, pas
   de soin. Les groupes ci-dessous sont donc la SEULE liste : le mot et les statuts qu'il
   recouvre sont écrits une fois, et les trois écrans les lisent.

   LE CHOIX DES MOTS, ET POURQUOI. Les deux écrans ne montrent pas le même nombre de tuiles :
   le livreur en a quatre (son téléphone est étroit et il regroupe), la cliente cinq. Aucun des
   deux n'a tort. Ce qui était faux, c'est que le MÊME mot recouvre deux ensembles différents.
   On garde donc les deux découpages et on leur donne deux mots distincts :

       livreur   « En route »     = récupéré + en livraison   (c'est dans ses mains, ça bouge)
       cliente   « En livraison » = en livraison              (le mot du référentiel, exact)

   « En route » dit ce que le livreur voit : la marchandise a quitté la vendeuse et n'est pas
   encore arrivée. « En livraison » dit ce que la cliente suit : le livreur est parti avec.
   Plus aucun mot ne recouvre deux ensembles, et chacun se traduit sans ambiguïté au téléphone.
   ========================================================================================== */

/* Les groupes affichés, et RIEN QUE ça : un mot, les statuts qu'il recouvre, et de quel
   référentiel il tire sa couleur. Ce n'est pas la liste des statuts (STATUTS, dans config.js,
   reste la source unique de ceux-là) : c'est la liste des paquets qu'on montre.

   « tuile: false » veut dire : ce groupe est compté, mais il n'a pas de tuile. Le téléphone du
   livreur fait 390 px et quatre tuiles y tiennent ; une cinquième les écraserait. Le groupe
   existe quand même, parce que la ligne de résumé, elle, a la place de le dire. */
const GROUPES_DU_JOUR = {
  // Le découpage du livreur : quatre tuiles sur un téléphone étroit.
  livreur: [
    { cle: 'pas_pris',   label: 'Pas encore pris', statuts: ['en_attente'],                teinte: 'en_attente' },
    { cle: 'en_route',   label: 'En route',        statuts: ['recupere', 'en_livraison'],  teinte: 'en_livraison' },
    { cle: 'livres',     label: 'Livrés',          statuts: ['livre'],                     teinte: 'livre' },
    { cle: 'non_livres', label: 'Non livrés',      statuts: ['non_livre'],                 teinte: 'non_livre' },
    /* LE RETOUR N'APPARAISSAIT NULLE PART SUR SA CARTE. Trouvé le 17/09 en relisant ce
       travail : un colis revenu le jour même donnait « 0 pas encore pris · 0 en route ·
       1 livré · 0 non livré » — et rien. Or le point 7.3 a fait du retour un geste qui lui
       reste à faire : la marchandise est dans ses mains et la cliente attend. Pas de
       cinquième tuile (le téléphone est trop étroit), mais la ligne de résumé le dit. */
    { cle: 'a_rendre',   label: 'À rendre',        statuts: ['retour'],                    teinte: 'retour', tuile: false },
  ],
  // Le découpage de la cliente : cinq tuiles, « Récupérés » a la sienne, donc « En livraison »
  // ne recouvre que le trajet.
  cliente: [
    { cle: 'en_attente',   label: 'En attente',   statuts: ['en_attente'],   teinte: 'en_attente' },
    { cle: 'recuperes',    label: 'Récupérés',    statuts: ['recupere'],     teinte: 'recupere' },
    { cle: 'en_livraison', label: 'En livraison', statuts: ['en_livraison'], teinte: 'en_livraison' },
    { cle: 'livres',       label: 'Livrés',       statuts: ['livre'],        teinte: 'livre' },
    { cle: 'non_livres',   label: 'Non livrés',   statuts: ['non_livre'],    teinte: 'non_livre' },
  ],
};

/* Compte une liste de colis selon un découpage. Renvoie [{ cle, label, count, color, bg }].
   C'est LE calcul : aucun écran ne recompte à côté. Une ligne de résumé et les tuiles qu'elle
   surplombe lisent forcément le même tableau — c'est ce qui rend impossible le « 1 + 1 = 2 en
   cours » du 17 septembre. */
function compterLeJour(colis, decoupage) {
  const liste = colis || [];
  const groupes = GROUPES_DU_JOUR[decoupage] || GROUPES_DU_JOUR.livreur;
  return groupes.map(function (g) {
    const ref = (typeof STATUTS !== 'undefined' && STATUTS[g.teinte]) || { color: '#8a94a3', bg: '#eef0f3' };
    return {
      cle: g.cle,
      label: g.label,
      tuile: g.tuile !== false,
      count: liste.filter(function (c) { return c && g.statuts.indexOf(c.statut) !== -1; }).length,
      color: ref.color,
      bg: ref.bg,
    };
  });
}

// Les tuiles, dessinées à partir de ce comptage-là. La MÊME fonction sert au téléphone du
// livreur et à son aperçu côté équipe : les deux écrans ne peuvent pas annoncer deux comptes
// différents pour la même tournée.
function tuilesDuJourHTML(colis, decoupage) {
  return compterLeJour(colis, decoupage).filter(function (b) { return b.tuile; }).map(function (b) {
    return '\n      <div style="flex:1; min-width:70px; text-align:center; background:' + b.bg
      + '; border-radius:10px; padding:8px 6px;">'
      + '\n        <div style="font-size:20px; font-weight:700; color:' + b.color + '; line-height:1;">' + b.count + '</div>'
      + '\n        <div style="font-size:11px; color:' + b.color + '; margin-top:3px;">' + b.label + '</div>'
      + '\n      </div>\n    ';
  }).join('');
}

// Ancien nom, gardé parce que deux écrans l'appellent : il ne fait plus que déléguer, au
// découpage du livreur. Un seul endroit décide de ce que « En route » veut dire.
function tourneeTuilesHTML(colis) {
  return tuilesDuJourHTML(colis, 'livreur');
}

/* La ligne de résumé de la carte du livreur, repliée. Elle disait « 2 en cours » quand les
   tuiles disaient « 1 pas encore pris · 1 en cours » : elle recomptait de son côté, en
   ajoutant en_attente. Elle lit maintenant le même tableau que les tuiles, et ne peut plus
   s'en écarter. Les groupes à zéro sont tus — sauf « En route », qui est la réponse à la
   question qu'on se pose en ouvrant l'écran : il reste quoi ? */
function resumeDuJourTexte(colis) {
  const par = {};
  compterLeJour(colis, 'livreur').forEach(function (g) { par[g.cle] = g; });
  const morceaux = [par.en_route.count + ' en route'];
  if (par.pas_pris.count) morceaux.push(par.pas_pris.count + ' pas encore pris');
  const l = par.livres.count;
  morceaux.push(l + ' livré' + (l > 1 ? 's' : ''));
  const nl = par.non_livres.count;
  if (nl) morceaux.push(nl + ' non livré' + (nl > 1 ? 's' : ''));
  // Le retour n'a pas de tuile, mais il a sa place ici : c'est un geste qui lui reste à faire.
  if (par.a_rendre && par.a_rendre.count) morceaux.push(par.a_rendre.count + ' à rendre');
  return morceaux.join(' · ');
}
