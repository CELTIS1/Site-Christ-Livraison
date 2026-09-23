/* L'ACTIVITÉ DE LA CLIENTE — la règle (23 septembre 2026)
   ==========================================================================================
   Celtis : « il faudrait que les clientes aient un espace pour renseigner le type d'activité
   qu'elles font ; on saura quel vendeur vend quel produit ; ça nous permettra de faire la
   publicité, d'orienter, d'interconnecter ». Les plateformes de livraison sérieuses tiennent
   une fiche marchand (secteur, catalogue, canaux de vente) : c'est ce qu'on ajoute, en cinq
   champs, pas en vingt.

   CE QU'ON RETIENT D'UNE CLIENTE :
     • secteur     — UNE valeur, dans une liste courte et fermée (on additionne dessus) ;
     • produits    — une phrase libre (« robes wax, sacs ») ;
     • canaux      — où elle vend (WhatsApp, Instagram, TikTok, Facebook, boutique, marché) ;
     • lien        — sa page ou son catalogue (http…) ;
     • presentable — elle accepte que CLT présente son activité (site, réseaux). SANS CE OUI,
                     RIEN N'EST PUBLIÉ : la charte interdit toute mise en avant sans accord.

   Table : activites_clientes (une ligne par cliente, profile_id = profiles.id).
   Pur : ni DOM, ni base. Exposé sur window.CLTActivite (et module Node pour le banc).
   ========================================================================================== */
(function (racine) {
  'use strict';

  const SECTEURS = [
    { cle: 'mode',            nom: 'Mode et vêtements' },
    { cle: 'beaute',          nom: 'Beauté et cosmétiques' },
    { cle: 'alimentation',    nom: 'Alimentation et boissons' },
    { cle: 'electromenager',  nom: 'Électroménager' },
    { cle: 'telephonie',      nom: 'Téléphonie et informatique' },
    { cle: 'maison',          nom: 'Maison et décoration' },
    { cle: 'enfants',         nom: 'Bébés et enfants' },
    { cle: 'sante',           nom: 'Santé et bien-être' },
    { cle: 'documents',       nom: 'Documents et courrier' },
    { cle: 'autre',           nom: 'Autre' },
  ];
  const CANAUX = [
    { cle: 'whatsapp',  nom: 'WhatsApp' },
    { cle: 'instagram', nom: 'Instagram' },
    { cle: 'tiktok',    nom: 'TikTok' },
    { cle: 'facebook',  nom: 'Facebook' },
    { cle: 'boutique',  nom: 'Boutique physique' },
    { cle: 'marche',    nom: 'Marché' },
    { cle: 'site',      nom: 'Site web' },
  ];
  const PRODUITS_MAX = 140;

  const nomSecteur = (cle) => { const s = SECTEURS.find((x) => x.cle === cle); return s ? s.nom : ''; };
  const nomCanal = (cle) => { const c = CANAUX.find((x) => x.cle === cle); return c ? c.nom : ''; };

  /* Nettoie une saisie (formulaire cliente ou bureau) et dit ce qui ne va pas.
     Rien n'est obligatoire : une cliente peut ne remplir que le secteur. Mais ce qui est
     rempli doit être juste : secteur connu, canaux connus, lien qui ressemble à un lien. */
  function normaliser(saisie) {
    const s = saisie || {};
    const erreurs = [];
    const secteur = String(s.secteur || '').trim();
    if (secteur && !SECTEURS.some((x) => x.cle === secteur)) erreurs.push('Secteur inconnu.');
    let produits = String(s.produits || '').replace(/\s+/g, ' ').trim();
    if (produits.length > PRODUITS_MAX) { produits = produits.slice(0, PRODUITS_MAX).trim(); }
    const canaux = Array.from(new Set((Array.isArray(s.canaux) ? s.canaux : []).map((c) => String(c).trim()).filter(Boolean)));
    const inconnus = canaux.filter((c) => !CANAUX.some((x) => x.cle === c));
    if (inconnus.length) erreurs.push('Canal inconnu : ' + inconnus.join(', ') + '.');
    let lien = String(s.lien || '').trim();
    if (lien && !/^https?:\/\//i.test(lien)) lien = 'https://' + lien;
    if (lien && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(lien)) erreurs.push('Le lien ne ressemble pas à une adresse web.');
    const presentable = s.presentable === true || s.presentable === 'true' || s.presentable === 1;
    return {
      valeurs: { secteur: secteur || null, produits: produits || null, canaux: canaux, lien: lien || null, presentable: presentable },
      erreurs: erreurs,
      vide: !secteur && !produits && !canaux.length && !lien,
    };
  }

  /* Une ligne lisible, la même partout (liste des comptes, fiche, gestion) :
     « Mode et vêtements · robes wax, sacs · WhatsApp, Instagram ». */
  function resume(a) {
    if (!a) return '';
    const parts = [];
    if (a.secteur) parts.push(nomSecteur(a.secteur) || a.secteur);
    if (a.produits) parts.push(a.produits);
    const cx = (a.canaux || []).map(nomCanal).filter(Boolean);
    if (cx.length) parts.push(cx.join(', '));
    return parts.join(' · ');
  }

  /* La mine d'informations : combien de clientes par secteur, par canal, combien ont dit oui
     à la mise en avant, combien n'ont rien rempli (sur le nombre de comptes clientes). */
  function statistiques(activites, nbClientes) {
    const lignes = activites || [];
    const remplies = lignes.filter((a) => a.secteur || a.produits || (a.canaux && a.canaux.length) || a.lien);
    const compter = (cles, cleDe) => cles.map((k) => ({ cle: k.cle, nom: k.nom, nombre: remplies.filter((a) => cleDe(a, k.cle)).length }))
      .filter((l) => l.nombre > 0).sort((x, y) => y.nombre - x.nombre || x.nom.localeCompare(y.nom, 'fr'));
    return {
      total: typeof nbClientes === 'number' ? nbClientes : lignes.length,
      remplies: remplies.length,
      presentables: remplies.filter((a) => a.presentable).length,
      parSecteur: compter(SECTEURS, (a, k) => a.secteur === k),
      parCanal: compter(CANAUX, (a, k) => (a.canaux || []).indexOf(k) >= 0),
      sansSecteur: remplies.filter((a) => !a.secteur).length,
    };
  }

  /* La phrase du haut de la boîte, en français, sans chiffre trompeur. */
  function phrase(st) {
    if (!st.total) return 'Aucun compte cliente pour l’instant.';
    if (!st.remplies) return `Aucune des ${st.total} clientes n’a encore renseigné son activité.`;
    const tete = st.parSecteur[0];
    const canal = st.parCanal[0];
    let p = `${st.remplies} cliente${st.remplies > 1 ? 's' : ''} sur ${st.total} ${st.remplies > 1 ? 'ont' : 'a'} renseigné ${st.remplies > 1 ? 'leur' : 'son'} activité`;
    if (tete) p += ` — d’abord ${tete.nom.toLowerCase()} (${tete.nombre})`;
    if (canal) p += `, surtout via ${canal.nom}`;
    p += `. ${st.presentables} accepte${st.presentables > 1 ? 'nt' : ''} d’être présentée${st.presentables > 1 ? 's' : ''} par CLT.`;
    return p;
  }

  /* Pour un export ou une liste : les clientes présentables, prêtes pour la communication. */
  function presentables(activites, nomDe) {
    return (activites || []).filter((a) => a.presentable && (a.secteur || a.produits))
      .map((a) => ({ profile_id: a.profile_id, nom: nomDe ? nomDe(a.profile_id) : '', secteur: nomSecteur(a.secteur), produits: a.produits || '', canaux: (a.canaux || []).map(nomCanal), lien: a.lien || '' }))
      .sort((x, y) => (x.secteur + x.nom).localeCompare(y.secteur + y.nom, 'fr'));
  }

  racine.CLTActivite = { SECTEURS, CANAUX, PRODUITS_MAX, nomSecteur, nomCanal, normaliser, resume, statistiques, phrase, presentables };
})(typeof window !== 'undefined' ? window : globalThis);
