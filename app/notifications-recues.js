/* LES NOTIFICATIONS REÇUES — la règle (23 septembre 2026)
   ==========================================================================================
   Celtis, après les premières notifications de colis reportés : « c'est très bon, mais il
   faudrait pouvoir consulter quand on veut, comme on veut. Quand on a consulté une fois, c'est
   parti, on ne peut plus consulter encore. Comment on fait pour pouvoir retrouver ? »

   Une notification poussée ne vivait que sur le téléphone. Depuis ce jour, la fonction serveur
   envoyer-push en garde une copie par destinataire dans la table `notifications`, et chaque
   espace la montre sous une cloche 🔔 dans la barre du haut — comme le font les applications
   qu'on connaît : pastille des non-lues, liste par jour, un appui ouvre l'objet concerné.

   Ce fichier ne touche ni au DOM ni à la base : il dit comment lire une ligne (quand, où elle
   mène), comment grouper par jour et comment compter. L'écran est dans cloche.js ; le banc
   tests/les-notifications-recues.test.mjs fait tourner la règle.
   ========================================================================================== */
(function () {
  'use strict';

  const JOUR_MS = 24 * 60 * 60 * 1000;

  function jourLocal(d, tz) {
    // AAAA-MM-JJ dans le fuseau du lecteur (son téléphone), pas celui de l'entreprise : « aujourd'hui »
    // veut dire aujourd'hui là où il lit.
    const p = new Intl.DateTimeFormat('fr-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz || undefined }).format(d);
    return p;
  }

  /* « Aujourd'hui », « Hier », sinon « lundi 21 sept. » — l'en-tête d'un groupe. */
  function etiquetteDuJour(iso, maintenant, tz) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const now = maintenant ? new Date(maintenant) : new Date();
    const j = jourLocal(d, tz), aujourdhui = jourLocal(now, tz), hier = jourLocal(new Date(now.getTime() - JOUR_MS), tz);
    if (j === aujourdhui) return 'Aujourd’hui';
    if (j === hier) return 'Hier';
    const texte = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: tz || undefined });
    return texte.charAt(0).toUpperCase() + texte.slice(1);
  }

  /* « 14 h 05 » — l'heure, dans le fuseau du lecteur. */
  function heure(iso, tz) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const t = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz || undefined });
    return t.replace(':', ' h ');
  }

  /* Les plus récentes d'abord, groupées par jour : [{ jour: 'Aujourd’hui', lignes: [...] }, …]. */
  function grouperParJour(notifs, maintenant, tz) {
    const triees = (notifs || []).slice().sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)));
    const groupes = [];
    triees.forEach((n) => {
      const cle = jourLocal(new Date(n.cree_le), tz);
      let g = groupes[groupes.length - 1];
      if (!g || g.cle !== cle) { g = { cle, jour: etiquetteDuJour(n.cree_le, maintenant, tz), lignes: [] }; groupes.push(g); }
      g.lignes.push(n);
    });
    return groupes;
  }

  function nonLues(notifs) { return (notifs || []).filter((n) => !n.lu_le); }
  function compter(notifs) { const l = notifs || []; return { total: l.length, nonLues: nonLues(l).length }; }

  /* Où mène une notification. Une adresse complète (`url`) est prise telle quelle ; un paramètre
     (`param`, « colis=… ») se colle à la page du lecteur — jamais à celle d'un autre rôle. Rien
     des deux : la notification se lit, elle ne mène nulle part. */
  /* La page qui sait OUVRIR l'objet, selon la page d'où l'on lit (24/09/2026, Celtis : « quand je
     clique, ça ne m'envoie nulle part ») : un colis se trouve sur l'écran du rôle — Gestion n'a
     pas de liste de colis, c'est l'écran Équipe qui l'a ; une course, sur l'écran Express. */
  /* 24/09/2026, Celtis : « la notification est là, mais quand je clique, ça ne m'envoie nulle
     part ». Chaque sorte d'objet a SA page selon qui lit : un signalement est sur la carte du
     colis (colis=…), un point de cliente ou de livreur sur Suivi de l'écran Équipe, une demande
     de passage sur Tournées (équipe) ou sur la carte « Demander un passage » (cliente), un
     reversement sur le reçu, dans Récap (cliente). */
  const EQUIPE = { 'equipe.html': 'equipe.html', 'gestion.html': 'equipe.html' };
  const PAGE_POUR = {
    colis: { 'livreur.html': 'livreur.html', 'fournisseur.html': 'fournisseur.html', 'equipe.html': 'equipe.html', 'gestion.html': 'equipe.html' },
    course: { 'express-client.html': 'express-client.html', 'express-coursier.html': 'express-coursier.html' },
    passage: { 'equipe.html': 'equipe.html', 'gestion.html': 'equipe.html', 'fournisseur.html': 'fournisseur.html' },
    point: EQUIPE,
    'point-livreur': EQUIPE,
    reversement: { 'fournisseur.html': 'fournisseur.html' },
  };
  /* Le paramètre porte l'identifiant, et parfois le jour (« point=…&jour=2026-09-24 ») : rien
     d'autre n'est accepté, jamais une adresse bricolée. */
  const PARAM = /^([a-z-]+)=([A-Za-z0-9-]+)(?:&jour=\d{4}-\d{2}-\d{2})?$/;
  function lien(n, pageCourante) {
    if (!n) return null;
    if (n.url && /^\/app\//.test(n.url)) return n.url;
    const m = String(n.param || '').match(PARAM);
    if (!m) return null;
    const pages = PAGE_POUR[m[1]];
    const page = pages ? (pages[pageCourante] || null) : (pageCourante || null);
    return page ? page + '?' + n.param : null;
  }

  /* Le petit signe devant le titre : le titre des pushs commence déjà par un pictogramme
     (« 📦 Colis récupéré ») ; on ne double pas. */
  function pictoEtTitre(titre) {
    const t = String(titre || '').trim();
    const m = t.match(/^(\p{Extended_Pictographic}️?)\s*(.*)$/u);
    return m ? { picto: m[1], titre: m[2] } : { picto: '🔔', titre: t };
  }

  window.CLTNotifications = { etiquetteDuJour, heure, grouperParJour, nonLues, compter, lien, pictoEtTitre };
})();
