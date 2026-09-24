/* À CONFIER — la règle (chantier N, lot 17, 25 septembre 2026)
   ==========================================================================================
   Celtis (25/09) : « l'enregistrement des colis depuis la création jusqu'à l'assignation doit
   être simplifié également pour moins de parcours et de gymnastique. Pour le moment l'assignation
   se fait plus tard après la création du colis car on ne sait pas d'office quel livreur va
   livrer. » Mesuré le 25/09 : créer trois colis puis les confier = 47 à 54 gestes sur deux
   écrans, parce que confier se faisait colis par colis, dans la fiche « Modifier ».

   La règle : ce qui attend un livreur, regroupé PAR CLIENTE, le plus ancien en premier, et
   pour chaque groupe UNE écriture — le bon champ selon l'état du colis :
     · un colis « récupéré » (déjà entre nos mains) attend un livreur de LIVRAISON → livreur_id ;
     · un colis « en attente » (encore chez la cliente) attend un livreur de COLLECTE
       → livreur_collecte_id ; la base recopie ce livreur en livreur_id au moment du « récupéré ».
   L'écran (equipe/19-a-confier.js) ne fait que dessiner ces groupes et envoyer ces écritures.
   Exposé sur window.CLTAConfier ; banc tests/a-confier.test.mjs. */
(function () {
  'use strict';

  const CHAMP = { recupere: 'livreur_id', en_attente: 'livreur_collecte_id' };

  /* Un colis attend un livreur si : récupéré sans livreur de livraison, ou en attente sans
     livreur de collecte. Les autres états ont déjà quelqu'un, ou sont clos. */
  function attendUnLivreur(c) {
    if (!c) return false;
    if (c.statut === 'recupere') return !c.livreur_id;
    if (c.statut === 'en_attente') return !c.livreur_collecte_id;
    return false;
  }

  function jour(iso) { return String(iso || '').slice(0, 10); }

  /* groupesAConfier(colis, { aujourdhui, nomCliente(id) })
     → [{ fournisseur_id, nom, colis: [...], nb, nbLivraison, nbCollecte, depuis (ISO du plus
          ancien), enRetard (créé avant aujourd'hui) }], le plus ancien groupe en premier. */
  function groupesAConfier(colis, options) {
    const o = options || {};
    const nom = typeof o.nomCliente === 'function' ? o.nomCliente : function (id) { return id; };
    const parCliente = new Map();
    (colis || []).filter(attendUnLivreur).forEach(function (c) {
      const cle = c.fournisseur_id || '—';
      if (!parCliente.has(cle)) parCliente.set(cle, { fournisseur_id: cle, nom: nom(cle) || 'Cliente inconnue', colis: [] });
      parCliente.get(cle).colis.push(c);
    });
    const groupes = Array.from(parCliente.values()).map(function (g) {
      g.colis.sort(function (a, b) { return String(a.created_at || '').localeCompare(String(b.created_at || '')); });
      g.nb = g.colis.length;
      g.nbLivraison = g.colis.filter(function (c) { return c.statut === 'recupere'; }).length;
      g.nbCollecte = g.nb - g.nbLivraison;
      g.depuis = g.colis.length ? (g.colis[0].created_at || null) : null;
      g.enRetard = !!(o.aujourdhui && g.depuis && jour(g.depuis) < o.aujourdhui);
      return g;
    });
    groupes.sort(function (a, b) { return String(a.depuis || '').localeCompare(String(b.depuis || '')); });
    return groupes;
  }

  /* ecrituresPourConfier(colis, livreurId) → [{ champ, livreur_id, ids }] : une écriture par
     champ (livraison / collecte). Un colis qui n'attend rien, ou déjà chez ce livreur, est laissé. */
  function ecrituresPourConfier(colis, livreurId) {
    if (!livreurId) return [];
    const par = {};
    (colis || []).filter(attendUnLivreur).forEach(function (c) {
      const champ = CHAMP[c.statut];
      if (!champ || c[champ] === livreurId) return;
      (par[champ] = par[champ] || []).push(c.id);
    });
    return Object.keys(par).map(function (champ) { return { champ: champ, livreur_id: livreurId, ids: par[champ] }; });
  }

  /* Ce qu'on annonce quand c'est fait : « 3 colis confiés à Koffi » — et, si le groupe mêle les
     deux états, ce que ça veut dire pour chacun. */
  function phraseConfie(ecritures, nomLivreur) {
    const n = (ecritures || []).reduce(function (t, e) { return t + e.ids.length; }, 0);
    if (!n) return 'Rien à confier.';
    const liv = (ecritures || []).find(function (e) { return e.champ === 'livreur_id'; });
    const col = (ecritures || []).find(function (e) { return e.champ === 'livreur_collecte_id'; });
    let s = n + ' colis confié' + (n > 1 ? 's' : '') + ' à ' + (nomLivreur || 'ce livreur');
    if (liv && col) s += ' — ' + liv.ids.length + ' à livrer, ' + col.ids.length + ' à récupérer chez la cliente';
    else if (col) s += ' — à récupérer chez la cliente';
    return s + '.';
  }

  /* Le résumé du bloc : « 7 colis à confier · 3 clientes · le plus ancien depuis hier ». */
  function resume(groupes, aujourdhui) {
    const n = (groupes || []).reduce(function (t, g) { return t + g.nb; }, 0);
    if (!n) return 'Tout a un livreur.';
    const retard = (groupes || []).filter(function (g) { return g.enRetard; }).length;
    return n + ' colis à confier · ' + groupes.length + ' cliente' + (groupes.length > 1 ? 's' : '') + (retard ? ' · ' + retard + ' depuis avant aujourd\'hui' : '');
  }

  window.CLTAConfier = { attendUnLivreur, groupesAConfier, ecrituresPourConfier, phraseConfie, resume, CHAMP };
})();
