/* ESPACE ÉQUIPE — UNE SEULE RECHERCHE POUR TOUT (point 7.8, 17 septembre 2026)
   ============================================================================================
   Chercher un colis, une personne ou une course depuis n'importe quel onglet, en interrogeant
   la base et non la page. Chargé après 10-onglets.js : il appelle showEquipeTab() pour
   conduire au bon écran.
   ============================================================================================
   MESURÉ : le bureau avait SIX champs de recherche, cloisonnés dans leurs onglets — colis,
   comptes, comptes en attente, historique, courses Express, recharges Express. Un client
   appelle et donne son numéro : il fallait le taper dans trois d'entre eux, en changeant
   d'onglet entre chaque, pour savoir s'il s'agissait d'un colis, d'une cliente ou d'une course.

   CELLE-CI NE REMPLACE PAS LES SIX AUTRES, et c'est délibéré. Les six filtrent une liste déjà
   à l'écran ; celle-ci interroge la BASE. Ce sont deux questions différentes : « affine cette
   liste » d'un côté, « où est cette chose ? » de l'autre. Retirer les six pour n'en garder
   qu'une obligerait à recharger la base pour affiner un tableau qu'on a déjà sous les yeux.

   ELLE NE FAIT QUE CONDUIRE. Chaque résultat ouvre l'écran qui sait déjà traiter la chose.
   Aucune fiche nouvelle à maintenir, et aucun risque qu'un deuxième affichage d'un colis se
   mette à dire autre chose que le premier.

   CE QUI A ÉTÉ CORRIGÉ LE 18/09 AU SOIR. Celtis : « j'ai mis Aloha, la cliente Aloha Shop. Ça
   me suggère, je clique dessus, ça m'envoie dans le compte, mais ça ne m'envoie pas là où il
   faut. Ça ne me présente pas ses colis, ça ne me présente pas son compte. Ça sert à quoi ? »

   Il avait raison, et le défaut était de conception. Une personne trouvée était conduite vers
   l'onglet COMPTES — l'écran d'administration des comptes (valider, créer, suspendre) — et on
   s'y contentait de RECOPIER SON NOM dans le champ de filtre. Deux erreurs dans un seul geste :

     1. Comptes n'est pas l'écran d'une cliente. Ce qu'on cherche en tapant son nom, c'est sa
        FICHE : son téléphone, ses colis, ce qu'on lui doit, le bouton pour la reverser. Cet
        écran existe depuis le 5 septembre, et la recherche n'y conduisait pas.
     2. On recopiait le TEXTE au lieu d'emmener l'IDENTIFIANT. La base le renvoie pourtant, et
        on le jetait. Un filtre par nom échoue dès que le nom affiché n'est pas celui que le
        filtre compare — « Aloha Shop » en nom de boutique, un autre nom en nom de personne : la
        liste ressortait vide alors que la cliente était là.

   Désormais l'identifiant voyage jusqu'au bout : une cliente ouvre SA fiche, un livreur la
   sienne, et un second bouton « Ses colis » conduit à ses colis. Les comptes d'équipe et les
   clients Express, eux, n'ont pas de fiche : pour eux l'onglet Comptes reste la bonne réponse.

   CE QU'ELLE NE CHERCHE PAS : l'argent. Ni montants, ni caisse, ni paie. Une recherche libre
   qui traverse la comptabilité est une porte qu'on n'ouvre pas pour gagner trois secondes.
   ============================================================================================ */

// Trois caractères : en dessous, « 07 » ramènerait la moitié d'Abidjan et l'écran clignoterait
// à chaque frappe. Au-dessus, on ne peut plus chercher un numéro de colis par ses derniers
// chiffres, ce que le bureau fait tout le temps. La base applique la même règle de son côté.
const RECHERCHE_MINIMUM = 3;
const RECHERCHE_PAR_FAMILLE = 6;   // au-delà, on dit « et d'autres » : la liste doit tenir sans défiler

let rechercheTimer = null;
let rechercheDerniere = '';

/* POURQUOI C'EST LA BASE QUI CHERCHE, ET PAS CET ÉCRAN.
   Un premier jet interrogeait les trois tables d'ici, avec des « contient ». Il marchait pour
   les noms et les adresses et il ÉCHOUAIT sur le cas qui a motivé ce point : le téléphone. Les
   numéros sont enregistrés tantôt « 0798546662 », tantôt « 07 98 54 66 62 », tantôt avec
   l'indicatif — et un « contient » ne rapproche pas deux écritures du même numéro. Mesuré :
   taper le numéro sans espaces ne trouvait rien, alors que le colis était là.
   La fonction chercher_partout() normalise des DEUX côtés, ce que seule la base sait faire ;
   elle refuse aussi quiconque n'est pas du bureau, et ne touche jamais à l'argent. */
async function rechercherPartout(terme) {
  if (String(terme || '').trim().length < RECHERCHE_MINIMUM) return null;
  const { data, error } = await supabaseClient.rpc('chercher_partout', {
    p_terme: terme, p_par_famille: RECHERCHE_PAR_FAMILLE + 1,
  });
  if (error) { console.error('chercher_partout :', error.message || error); return { erreur: true, terme: terme }; }
  const par = { colis: [], personne: [], course: [] };
  (data || []).forEach(l => { if (par[l.famille]) par[l.famille].push(l); });
  return { terme: terme, colis: par.colis, gens: par.personne, courses: par.course };
}


function rechercheResultatsHTML(res) {
  if (!res) return '';
  if (res.erreur) return `<div class="recherche-vide">La recherche n'a pas abouti. Réessayez dans un instant.</div>`;
  const total = res.colis.length + res.gens.length + res.courses.length;
  if (!total) return `<div class="recherche-vide">Rien trouvé pour « ${escapeHTML(res.terme)} ».</div>`;

  // Toutes les familles ont la même forme (titre, detail) : une seule fonction de ligne, donc
  // aucun risque qu'un type de résultat se mette à s'afficher autrement que les autres.
  const ligne = (l, va) => {
    const base = `data-va="${va}" data-id="${escapeHTML(l.id || '')}" data-terme="${escapeHTML(l.titre || '')}"`;
    const principal = `<button type="button" class="recherche-ligne" ${base}>
        <span class="recherche-quoi">${escapeHTML(l.titre || '')}</span>
        <span class="recherche-detail">${escapeHTML(l.detail || '')}</span>
      </button>`;
    /* DEUX GESTES POUR UNE PERSONNE, parce qu'on la cherche pour deux raisons : savoir où elle
       en est (sa fiche) ou voir ce qu'elle nous a confié (ses colis). Deviner laquelle, c'est
       se tromper une fois sur deux — et c'est exactement le reproche du 18/09. */
    if (va !== 'comptes' || !rechercheAUneFiche(l.id)) return principal;
    return `<div class="recherche-paire">${principal}<button type="button" class="recherche-ligne recherche-ligne--cote" data-va="colis-de" data-id="${escapeHTML(l.id || '')}" data-terme="${escapeHTML(l.titre || '')}" title="Voir ses colis dans l'onglet Colis">📦 Ses colis</button></div>`;
  };
  const groupe = (titre, lignes, va) => lignes.length
    ? `<div class="recherche-groupe"><div class="recherche-groupe-titre">${escapeHTML(titre)}</div>`
      + lignes.slice(0, RECHERCHE_PAR_FAMILLE).map(l => ligne(l, va)).join('')
      + (lignes.length > RECHERCHE_PAR_FAMILLE ? `<div class="recherche-reste">et d'autres — affinez la recherche</div>` : '')
      + `</div>`
    : '';

  return groupe('Colis', res.colis, 'colis')
    + groupe('Personnes', res.gens, 'comptes')
    + groupe('Courses Express', res.courses, 'express');
}

/* Conduire, et rien d'autre : on ouvre l'écran qui sait traiter la chose, en y posant la
   recherche. Le champ de cet écran-là fait ensuite son travail habituel — c'est lui qui a
   toujours su afficher un colis, et il n'y a pas deux façons de l'afficher. */
/* La personne a-t-elle une fiche à ouvrir ? On le demande aux listes que l'écran a déjà
   chargées — les clientes et les livreurs — plutôt que de lire le rôle dans le texte affiché.
   Un routage qui dépend d'une chaîne d'affichage casse le jour où l'on change le libellé, et il
   casse en silence. Un compte d'équipe ou un client Express n'a pas de fiche : il ne rend rien,
   et l'onglet Comptes reste sa destination. */
function rechercheAUneFiche(id) {
  if (!id) return false;
  if (typeof fournisseurs !== 'undefined' && (fournisseurs || []).some(f => f && f.id === id)) return 'cliente';
  if (typeof livreurs !== 'undefined' && (livreurs || []).some(l => l && l.id === id)) return 'livreur';
  return false;
}

// Le nom tel que la liste des colis le compare — et non celui que la recherche affiche. Les
// deux diffèrent dès qu'une cliente a un nom de boutique : c'est ce qui rendait la liste vide.
function rechercheNomPourLesColis(id, secours) {
  if (typeof fournisseurLabelPlain === 'function') {
    const nom = fournisseurLabelPlain(id);
    if (nom && nom !== 'Client inconnu') return nom;
  }
  if (typeof livreurs !== 'undefined') {
    const l = (livreurs || []).find(x => x && x.id === id);
    if (l) return l.full_name || secours;
  }
  return secours;
}

function rechercheAller(ou, terme, id) {
  rechercheFermer();
  if (ou === 'colis') {
    showEquipeTab('colis');
    const champ = document.getElementById('search-colis');
    if (champ) { champ.value = terme; champ.dispatchEvent(new Event('input', { bubbles: true })); }
    // Le colis trouvé est SURLIGNÉ, pas seulement filtré : sur une liste de plusieurs lignes,
    // « c'est lequel ? » est la question suivante. (18/09/2026)
    if (id && typeof cltMarquerColisAVoir === 'function') cltMarquerColisAVoir(id);
    setTimeout(() => {
      let carte = null;
      document.querySelectorAll('#colis-list .colis-item').forEach(el => { if (el.dataset.id === id) carte = el; });
      if (carte && carte.scrollIntoView) carte.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 260);
  } else if (ou === 'colis-de') {
    // Ses colis : on filtre sur le nom que la liste sait comparer.
    showEquipeTab('colis');
    const champ = document.getElementById('search-colis');
    const nom = rechercheNomPourLesColis(id, terme);
    if (champ) { champ.value = nom; champ.dispatchEvent(new Event('input', { bubbles: true })); }
  } else if (ou === 'comptes') {
    const quoi = rechercheAUneFiche(id);
    if (quoi === 'cliente' && window.CLTClients && typeof CLTClients.ouvrirFiche === 'function') {
      CLTClients.ouvrirFiche(id); return;
    }
    if (quoi === 'livreur' && window.CLTLivreurs && typeof CLTLivreurs.ouvrirFiche === 'function') {
      showEquipeTab('livreurs');
      setTimeout(() => CLTLivreurs.ouvrirFiche(id), 260);
      return;
    }
    showEquipeTab('comptes');
    const champ = document.getElementById('search-comptes');
    if (champ) { champ.value = terme; champ.dispatchEvent(new Event('input', { bubbles: true })); }
  } else if (ou === 'express') {
    showEquipeTab('express');
    const champ = document.getElementById('search-express-courses');
    if (champ) { champ.value = terme; champ.dispatchEvent(new Event('input', { bubbles: true })); }
  }
}

function rechercheFermer() {
  const boite = document.getElementById('eq-recherche-resultats');
  if (boite) { boite.classList.add('hidden'); cltPoserHTML(boite, ''); }
}

function rechercheAfficher(html) {
  const boite = document.getElementById('eq-recherche-resultats');
  if (!boite) return;
  cltPoserHTML(boite, html);
  boite.classList.toggle('hidden', !html);
  boite.querySelectorAll('.recherche-ligne').forEach(b => {
    b.addEventListener('click', () => rechercheAller(b.dataset.va, b.dataset.terme, b.dataset.id));
  });
}

(function brancherRecherchePartout() {
  const champ = document.getElementById('eq-recherche-tout');
  if (!champ) return;
  champ.addEventListener('input', () => {
    const terme = champ.value.trim();
    clearTimeout(rechercheTimer);
    if (terme.length < RECHERCHE_MINIMUM) { rechercheDerniere = ''; rechercheFermer(); return; }
    // 300 ms : cette recherche part en base, elle coûte plus qu'un filtre de liste. On attend
    // que la frappe se calme franchement avant d'interroger.
    rechercheTimer = setTimeout(async () => {
      rechercheDerniere = terme;
      rechercheAfficher('<div class="recherche-vide">Recherche…</div>');
      let res = null;
      try { res = await rechercherPartout(terme); } catch (e) { console.error('Recherche partout :', e); }
      // La frappe a continué pendant que la base répondait : ce résultat-là est périmé.
      if (rechercheDerniere !== terme) return;
      rechercheAfficher(res ? rechercheResultatsHTML(res)
        : '<div class="recherche-vide">La recherche n\'a pas abouti. Réessayez.</div>');
    }, 300);
  });
  // Échap ferme, comme partout ailleurs dans la maison.
  champ.addEventListener('keydown', (e) => { if (e.key === 'Escape') { champ.value = ''; rechercheFermer(); } });
  // Un clic ailleurs ferme aussi : la liste ne doit pas rester posée sur l'écran qu'on travaille.
  document.addEventListener('click', (e) => {
    const zone = document.getElementById('recherche-partout');
    if (zone && !zone.contains(e.target)) rechercheFermer();
  });
})();
