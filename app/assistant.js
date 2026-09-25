/* L'ASSISTANT — le bouton « casque » de chaque espace (chantier Q, 25 septembre 2026)
   ==========================================================================================
   Celtis : « dans toutes les applications modernes, il y a un assistant, un bouton flottant qui
   ouvre une conversation ; qu'il réponde automatiquement ». Propositions du 25/09, § 4 :
     étage 1 — l'aide qui parle : il cherche dans aide.json (fiches + vidéos) avec les mots de la
               personne, et ouvre la fiche ; marche hors ligne une fois l'aide lue ;
     étage 2 — ses données : « où est ma course ? », « combien CLT me doit ? », « ma journée ? » —
               des règles écrites, sur ce que la personne a déjà le droit de voir (RLS) ;
     toujours — un humain : « Parler à CLT » ouvre WhatsApp avec le contexte déjà écrit.
     étage 3 — l'IA qui comprend (26/09, Celtis : « il doit comprendre, analyser, répondre et orienter ») :
               quand la question est libre et qu'aucune règle ne la reconnaît, la fonction serveur
               `assistant-repondre` (Claude Haiku, plafonné, journalisé) répond avec la SITUATION de la
               personne et les fiches proches ; sans clé ou au-delà du plafond, tout marche comme avant.
   Placement : rond de 56 px, en bas à GAUCHE (le coin droit est celui de « Remonter / Aller en bas »),
   AU-DESSUS de la barre du bas (jamais dessus) et du bandeau de mise à jour. Exposé sur window.CLTAssistant (règles pures testées :
   normaliser, chercherFiches, intention). */
(function () {
  'use strict';
  var ICONE_BULLE = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H8l-4 3v-3.5A8 8 0 1 1 21 12z"/><circle cx="8.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="12" r="1" fill="currentColor" stroke="none"/></svg>';
  var WHATSAPP = '2250546818640';
  var SYNONYMES = {
    solde: ['solde', 'recharge', 'recharger', 'argent', 'portefeuille', 'wave', 'momo', 'credit'],
    course: ['course', 'commande', 'coursier', 'ou est', 'suivre', 'suivi'],
    code: ['code', 'chiffres', 'preuve', '4 chiffres', 'quatre chiffres'],
    signaler: ['signaler', 'probleme', 'plainte', 'reclamation', 'litige', 'abime', 'perdu', 'jamais recu'],
    releve: ['releve', 'doit', 'reverse', 'reversement', 'recu', 'mon argent', 'combien'],
    journee: ['journee', 'tournee', 'aujourd', 'mes colis'],
    retour: ['revient', 'revenu', 'rendre', 'retour', 'a rendre', 'rapporter'],
    passage: ['passage', 'demande', 'demander', 'venir', 'recuperer'],
    installer: ['installer', 'application', 'telephone', 'icone', 'ecran d accueil'],
    compte: ['compte', 'mot de passe', 'photo', 'nom', 'numero'],
    noter: ['note', 'noter', 'etoile', 'avis'],
    conditions: ['conditions', 'charte', 'interdit', 'valeur', 'assurance', 'cgu'],
    dispatch: ['pas de course', 'aucune course', 'vois pas', 'rayon', 'proche', 'disponible'],
    suspendu: ['suspendu', 'suspension', 'bloque', 'bloquee'],
  };
  function contient(texte, s) { return new RegExp('(^| )' + normaliser(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( |$)').test(texte); }   // mot entier : « prendre » ne contient pas « rendre »
  function normaliser(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function mots(t) { return normaliser(t).split(' ').filter(function (m) { return m.length > 2 && ['les', 'des', 'une', 'pour', 'mon', 'mes', 'est', 'que', 'qui', 'comment', 'faire', 'avec', 'dans', 'pas', 'sur'].indexOf(m) < 0; }); }
  /* chercherFiches(question, articles) → les 3 meilleures fiches [{ id, titre, score, video }] (score > 0). */
  function chercherFiches(question, articles) {
    var q = normaliser(question), qm = mots(question);
    if (!qm.length) return [];
    var themes = Object.keys(SYNONYMES).filter(function (k) { return SYNONYMES[k].some(function (s) { return contient(q, s); }); });
    return (articles || []).map(function (a) {
      var texte = normaliser([a.titre, a.resume].concat(a.etapes || [], [a.astuce || '']).join(' '));
      var score = 0;
      qm.forEach(function (m) { if (texte.indexOf(m) >= 0) score += 1; if (normaliser(a.titre).indexOf(m) >= 0) score += 3; });
      themes.forEach(function (k) { var titre = normaliser(a.titre); if (SYNONYMES[k].some(function (s) { return contient(titre, s); })) score += 4; else if (SYNONYMES[k].some(function (s) { return contient(texte, s); })) score += 1; });
      return { id: a.id, titre: a.titre, resume: a.resume, score: score, video: (a.medias || []).some(function (m) { return m.type === 'video'; }) };
    }).filter(function (x) { return x.score > 0; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 3);
  }
  /* intention(question, espace) → 'course' | 'code' | 'solde' | 'releve' | 'journee' | 'a_traiter' | 'humain' | null (étage 2). */
  function intention(question, espace) {
    var q = normaliser(question);
    var a = function (liste) { return liste.some(function (s) { return q.indexOf(normaliser(s)) >= 0; }); };
    if (a(['parler a', 'humain', 'quelqu un', 'appeler', 'whatsapp', 'urgent', 'joindre'])) return 'humain';
    if (espace === 'express-client' && a(['ou est', 'ou en est', 'ma course', 'mon coursier', 'arrive', 'suivre'])) return 'course';
    if (espace === 'express-client' && a(['code'])) return 'code';
    if (espace === 'express-coursier' && a(['solde', 'combien j ai', 'mon argent', 'portefeuille'])) return 'solde';
    if (espace === 'express-coursier' && a(['mes courses', 'en cours', 'ma course'])) return 'course';
    if (espace === 'fournisseur' && a(['doit', 'mon argent', 'releve', 'reverse', 'combien'])) return 'releve';
    if (espace === 'fournisseur' && a(['mes colis', 'ou est', 'ou en est', 'aujourd', 'livre'])) return 'journee';
    if (espace === 'livreur' && a(['ma journee', 'mes colis', 'combien', 'aujourd', 'a rendre', 'en main'])) return 'journee';
    if (espace === 'equipe' && a(['a traiter', 'urgent', 'combien', 'attend', 'sans coursier', 'litige'])) return 'a_traiter';
    return null;
  }
  var STATUTS_COURSE = { en_attente: 'en attente d\'un coursier', acceptee: 'acceptée : le coursier est en route vers le retrait', recuperee: 'récupérée : le coursier est en route vers la livraison', livree: 'livrée', annulee: 'annulée' };
  var STATUTS_COLIS = { en_attente: 'en attente de récupération', recupere: 'récupéré, chez CLT', en_livraison: 'en livraison', livre: 'livré', non_livre: 'non livré', retour: 'en retour' };
  var f = function (n) { return Number(n || 0).toLocaleString('fr-FR') + ' F'; };
  var esc = function (v) { return typeof escapeHTML === 'function' ? escapeHTML(String(v == null ? '' : v)) : String(v == null ? '' : v); };

  /* Les réponses de l'étage 2 : chacune lit ce que l'écran montrerait, rien de plus. */
  var REPONSES = {
    course: async function (espace, moi) {
      var q = espace === 'express-coursier' ? supabaseClient.from('express_courses').select('*').eq('coursier_id', moi).in('status', ['acceptee', 'recuperee']).order('accepted_at', { ascending: false }).limit(3)
                                            : supabaseClient.from('express_courses').select('*').eq('client_id', moi).in('status', ['en_attente', 'acceptee', 'recuperee']).order('created_at', { ascending: false }).limit(3);
      var r = await q; if (r.error) throw r.error;
      var l = r.data || [];
      if (!l.length) return { texte: espace === 'express-coursier' ? 'Aucune course en cours à votre nom. Les courses proches vous sont proposées dans « Dispo » quand vous êtes disponible.' : 'Aucune course en cours. Vos courses terminées sont dans « Mes courses », sous « Terminées ».', fiches: [espace === 'express-coursier' ? 'coursier-dispo' : 'express-commander'] };
      var c = l[0];
      var nom = '';
      if (espace === 'express-client' && c.coursier_id) { var p = await supabaseClient.from('profiles').select('full_name').eq('id', c.coursier_id).maybeSingle(); nom = p.data && p.data.full_name ? ' (' + p.data.full_name + ')' : ''; }
      var t = 'Votre course ' + esc(c.adresse_recuperation) + ' → ' + esc(c.adresse_livraison) + ' est <b>' + (STATUTS_COURSE[c.status] || c.status) + '</b>' + esc(nom) + '.';
      if (l.length > 1) t += ' Et ' + (l.length - 1) + ' autre' + (l.length > 2 ? 's' : '') + ' en cours.';
      return { texte: t, fiches: [espace === 'express-coursier' ? 'coursier-livrer' : 'express-suivre'], ouvrir: espace === 'express-coursier' ? 'section-mescourses' : 'section-courses' };
    },
    code: async function (espace, moi) {
      var r = await supabaseClient.from('express_courses').select('id, adresse_livraison, status').eq('client_id', moi).in('status', ['acceptee', 'recuperee']).order('created_at', { ascending: false }).limit(1);
      if (r.error) throw r.error;
      if (!r.data || !r.data.length) return { texte: 'Le code apparaît sous votre course dès qu\'un coursier l\'a prise. Donnez-le à la personne qui reçoit le colis : le coursier le lui demande à la remise.', fiches: ['express-code'] };
      var k = await supabaseClient.from('express_codes_livraison').select('code').eq('course_id', r.data[0].id).maybeSingle();
      if (k.data && k.data.code) return { texte: 'Le code de livraison de votre course vers ' + esc(r.data[0].adresse_livraison) + ' est <b style="letter-spacing:.3em;font-size:22px;">' + esc(k.data.code) + '</b>. Donnez-le à la personne qui reçoit ; le coursier le demande à la remise.', fiches: ['express-code'] };
      return { texte: 'Le code est affiché sous votre course, dans « Mes courses ».', fiches: ['express-code'], ouvrir: 'section-courses' };
    },
    solde: async function (espace, moi) {
      var w = await supabaseClient.from('express_wallets').select('solde').eq('coursier_id', moi).maybeSingle();
      var cfg = await supabaseClient.from('express_config').select('solde_minimum').eq('id', 1).maybeSingle();
      var solde = w.data ? Number(w.data.solde) : 0, mini = cfg.data ? Number(cfg.data.solde_minimum) : 0;
      var t = 'Votre solde est de <b>' + f(solde) + '</b>.' + (solde < mini ? ' Il est sous le minimum (' + f(mini) + ') : rechargez pour accepter des courses.' : ' Vous pouvez accepter des courses.');
      return { texte: t, fiches: ['coursier-solde'], ouvrir: 'section-recharges' };
    },
    releve: async function () {
      var r = await supabaseClient.from('releve_fournisseur').select('*').maybeSingle();
      if (r.error || !r.data) return { texte: 'Votre relevé est dans l\'onglet « Récap » : ce que CLT vous doit, et chaque reversement avec son reçu.', fiches: ['cliente-releve'] };
      var d = r.data, net = d.net_a_reverser != null ? d.net_a_reverser : d.net_du;
      return { texte: 'CLT vous doit aujourd\'hui <b>' + f(net) + '</b>' + (d.nb_colis_a_reverser != null ? ' sur ' + d.nb_colis_a_reverser + ' colis livrés pas encore reversés' : '') + '. Le détail et vos reçus sont dans « Récap ».', fiches: ['cliente-releve'], ouvrir: 'section-releve' };
    },
    journee: async function (espace, moi) {
      var jour = typeof todayLocalISODate === 'function' ? todayLocalISODate() : new Date().toISOString().slice(0, 10);
      var q = espace === 'livreur' ? supabaseClient.from('colis').select('id, statut, livreur_id, livreur_collecte_id').or('livreur_id.eq.' + moi + ',livreur_collecte_id.eq.' + moi).gte('created_at', jour + 'T00:00:00').limit(500)
                                   : supabaseClient.from('colis').select('id, statut').eq('fournisseur_id', moi).gte('created_at', jour + 'T00:00:00').limit(500);
      var r = await q; if (r.error) throw r.error;
      var n = {}; (r.data || []).forEach(function (c) { n[c.statut] = (n[c.statut] || 0) + 1; });
      var total = (r.data || []).length;
      if (!total) return { texte: espace === 'livreur' ? 'Aucun colis à votre nom aujourd\'hui pour l\'instant.' : 'Aucun colis enregistré aujourd\'hui. Pour en annoncer : onglet « Ajouter », ou « Demander un passage ».', fiches: [espace === 'livreur' ? 'livreur-journee' : 'cliente-annoncer'] };
      var parts = Object.keys(n).map(function (s) { return n[s] + ' ' + (STATUTS_COLIS[s] || s); });
      return { texte: 'Aujourd\'hui : <b>' + total + ' colis</b> — ' + esc(parts.join(', ')) + '.', fiches: [espace === 'livreur' ? 'livreur-journee' : 'cliente-suivre'] };
    },
    a_traiter: async function () {
      var n = typeof window.rtLignes === 'function' ? window.rtLignes().length : null;
      if (n == null && window.CLTATraiter && Array.isArray(window.__litigesExpress)) n = null;
      var t = n != null ? '<b>' + n + '</b> ligne' + (n > 1 ? 's' : '') + ' attend' + (n > 1 ? 'ent' : '') + ' une décision dans « À traiter ».' : 'Tout ce qui attend une décision est dans « À traiter », le plus urgent en premier.';
      return { texte: t, fiches: ['equipe-retours'], onglet: 'retours' };
    },
  };

  var aideCache = null;
  function chargerAide() {
    if (aideCache) return Promise.resolve(aideCache);
    return fetch(cltUrlACote('aide.json'), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }).then(function (j) { aideCache = j; return j; });
  }
  function articlesDe(j, espace) {
    var E = (j && j.espaces) || {};
    return [].concat(E[espace] && E[espace].articles || [], E.tous && E.tous.articles || []);
  }
  var SUGGESTIONS = {
    livreur: ['Ma journée ?', 'Comment livrer avec la photo ?', 'Un colis revient : que faire ?'],
    fournisseur: ['Combien CLT me doit ?', 'Où en sont mes colis ?', 'Demander un passage'],
    equipe: ['Qu\'est-ce qui attend ?', 'Créer un colis puis le confier', 'Une course Express sans coursier'],
    'express-client': ['Où est ma course ?', 'Le code de livraison ?', 'Signaler un problème'],
    'express-coursier': ['Mon solde ?', 'Pourquoi je ne vois pas de courses ?', 'Livrer avec le code'],
  };
  var etat = { ouvert: false, espace: null, moi: null, nom: '', ia: true, historique: [] };

  function contexteWhatsApp(question) {
    var role = { livreur: 'livreur', fournisseur: 'cliente', equipe: 'équipe', 'express-client': 'client Express', 'express-coursier': 'coursier Express' }[etat.espace] || 'utilisateur';
    var m = 'Bonjour CLT, je suis ' + (etat.nom || 'un ' + role) + ' (' + role + '). ' + (question ? 'Ma question : ' + question : 'J\'ai besoin d\'aide.');
    return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(m);
  }
  function bulle(html, qui) { return '<div class="clt-assistant__bulle clt-assistant__bulle--' + qui + '">' + html + '</div>'; }
  function fichesHTML(ids, articles) {
    return (ids || []).map(function (id) { var a = articles.find(function (x) { return x.id === id; }); return a ? '<button type="button" class="clt-assistant__fiche" data-aide-ouvrir="' + esc(a.id) + '">' + ((a.medias || []).some(function (m) { return m.type === 'video'; }) ? '🎬 ' : '📄 ') + esc(a.titre) + '</button>' : ''; }).join('');
  }
  /* Étage 3 — quand demander à l'IA ? Jamais pour « humain » (WhatsApp direct) ni quand une règle de
     l'étage 2 a répondu ; sinon dès que la question est une phrase (deux mots utiles ou plus) ou qu'aucune
     fiche ne ressort nettement. Une question d'un mot avec une fiche nette (« relevé ») reste aux fiches. */
  function decider(question, intentionTrouvee, fiches) {
    if (intentionTrouvee) return 'regle';
    var n = mots(question).length;
    var nette = fiches && fiches.length && fiches[0].score >= 7;
    if (n >= 2 || !nette) return 'ia';
    return 'fiches';
  }
  function sansBalises(html) { return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
  var SITUATION = { livreur: ['journee'], fournisseur: ['releve', 'course'], equipe: ['a_traiter'], 'express-client': ['course'], 'express-coursier': ['solde', 'course'] };
  async function situationDe() {
    if (!etat.moi || typeof supabaseClient === 'undefined') return '';
    var lignes = [];
    for (var k = 0; k < (SITUATION[etat.espace] || []).length; k++) {
      try { var r = await REPONSES[SITUATION[etat.espace][k]](etat.espace, etat.moi); if (r && r.texte) lignes.push(sansBalises(r.texte)); } catch (e) { /* une ligne de moins */ }
    }
    return lignes.join('\n').slice(0, 1200);
  }
  async function demanderIA(question, fiches) {
    if (!etat.ia || typeof supabaseClient === 'undefined' || typeof SUPABASE_URL === 'undefined') return null;
    var session = null; try { session = (await supabaseClient.auth.getSession()).data.session; } catch (e) { session = null; }
    if (!session || !session.access_token) return null;
    var situation = await situationDe();
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var minuteur = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;
    try {
      var r = await fetch(SUPABASE_URL + '/functions/v1/assistant-repondre', {
        method: 'POST', signal: ctrl ? ctrl.signal : undefined,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token, 'apikey': SUPABASE_KEY },
        body: JSON.stringify({ question: question, espace: etat.espace, situation: situation, fiches: (fiches || []).map(function (f) { return { id: f.id, titre: f.titre, resume: f.resume }; }), historique: etat.historique.slice(-6) }),
      });
      if (!r.ok) return null;
      var j = await r.json();
      if (!j || j.repli) { if (j && (j.pourquoi === 'sans_cle' || j.pourquoi === 'inactif')) etat.ia = false; return null; }
      return j;
    } catch (e) { return null; } finally { if (minuteur) clearTimeout(minuteur); }
  }
  async function repondre(question) {
    var fil = document.getElementById('clt-assistant-fil'); if (!fil) return;
    fil.insertAdjacentHTML('beforeend', bulle(esc(question), 'moi'));
    var attente = document.createElement('div'); attente.className = 'clt-assistant__bulle clt-assistant__bulle--clt'; attente.textContent = '…'; fil.appendChild(attente);
    fil.scrollTop = fil.scrollHeight;
    var j = null; try { j = await chargerAide(); } catch (e) { j = null; }
    var articles = j ? articlesDe(j, etat.espace) : [];
    var html = '';
    var i = intention(question, etat.espace);
    if (i === 'humain') {
      html = 'Je vous passe CLT : le message est déjà écrit, il ne reste qu\'à l\'envoyer.<div class="clt-assistant__actions"><a class="btn clt-assistant__wa" target="_blank" rel="noopener" href="' + contexteWhatsApp(question) + '">💬 Parler à CLT sur WhatsApp</a></div>';
    } else if (i && etat.moi && typeof supabaseClient !== 'undefined') {
      try {
        var r = await REPONSES[i](etat.espace, etat.moi);
        html = r.texte + (r.fiches ? '<div class="clt-assistant__fiches">' + fichesHTML(r.fiches, articles) + '</div>' : '');
        if (r.ouvrir) html += '<div class="clt-assistant__actions"><button type="button" class="btn btn-sm clt-assistant__aller" data-assistant-aller="' + esc(r.ouvrir) + '">Y aller</button></div>';
        if (r.onglet) html += '<div class="clt-assistant__actions"><button type="button" class="btn btn-sm clt-assistant__aller" data-assistant-onglet="' + esc(r.onglet) + '">Ouvrir « À traiter »</button></div>';
      } catch (e) { html = 'Je n\'arrive pas à lire vos données pour l\'instant (réseau ?). Voici ce que l\'aide en dit :'; i = null; }
    }
    if (!html || i === null) {
      var trouvees = chercherFiches(question, articles);
      var ia = null;
      if (decider(question, i, trouvees) === 'ia') ia = await demanderIA(question, trouvees);
      if (ia && ia.reponse) {
        html += esc(ia.reponse);
        if (ia.fiche) html += '<div class="clt-assistant__fiches">' + fichesHTML([ia.fiche], articles) + '</div>';
        if (ia.humain) html += '<div class="clt-assistant__actions"><a class="btn clt-assistant__wa" target="_blank" rel="noopener" href="' + contexteWhatsApp(question) + '">💬 Parler à CLT sur WhatsApp</a></div>';
        etat.historique.push({ qui: 'moi', texte: question }, { qui: 'clt', texte: ia.reponse });
      } else if (trouvees.length) html += (html ? '' : 'Voici ce qui répond le mieux :') + '<div class="clt-assistant__fiches">' + fichesHTML(trouvees.map(function (t) { return t.id; }), articles) + '</div>';
      else html += (html ? '' : 'Je n\'ai pas trouvé de fiche pour ça. ') + '<div class="clt-assistant__actions"><a class="btn clt-assistant__wa" target="_blank" rel="noopener" href="' + contexteWhatsApp(question) + '">💬 Poser la question à CLT</a></div>';
    }
    attente.innerHTML = html;
    fil.scrollTop = fil.scrollHeight;
  }
  function dessiner() {
    var ancien = document.getElementById('clt-assistant');
    if (ancien) { ancien.classList.remove('hidden'); ancien.removeAttribute('hidden'); etat.ouvert = true; setTimeout(function () { try { document.getElementById('clt-assistant-champ').focus(); } catch (e) {} }, 80); return; }
    var ov = document.createElement('div'); ov.id = 'clt-assistant'; ov.className = 'clt-assistant';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Assistant CLT');
    // Pas une « couche » du gestionnaire d'historique : ouvrir une fiche d'aide DEPUIS l'assistant
    // fermait l'un pendant que l'autre s'ouvrait, et l'Échap suivant sortait de la page (25/09).
    // Échap est géré ici, à la main.
    var sugg = SUGGESTIONS[etat.espace] || ['Comment faire ?'];
    ov.innerHTML = '<div class="clt-assistant__boite">' +
      '<div class="clt-assistant__tete"><div class="clt-assistant__avatar">' + ICONE_BULLE.replace('width="28" height="28"', 'width="22" height="22"') + '</div><div><strong>Assistant CLT</strong><small>Je réponds tout de suite ; un humain est à un clic.</small></div><button type="button" class="clt-assistant__fermer" data-clt-fermer aria-label="Fermer">×</button></div>' +
      '<div class="clt-assistant__fil" id="clt-assistant-fil">' + bulle('Bonjour' + (etat.nom ? ' ' + esc(etat.nom.split(' ')[0]) : '') + ' 👋 Je peux vous aider ? Choisissez une question, ou écrivez la vôtre.', 'clt') + '</div>' +
      '<div class="clt-assistant__sugg">' + sugg.map(function (s) { return '<button type="button" class="clt-assistant__q" data-assistant-q="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div>' +
      '<form class="clt-assistant__saisie" id="clt-assistant-form"><input type="text" id="clt-assistant-champ" placeholder="Votre question…" maxlength="300" autocomplete="off" aria-label="Votre question"><button type="submit" class="btn" aria-label="Envoyer">➤</button></form>' +
      '<a class="clt-assistant__humain" target="_blank" rel="noopener" href="' + contexteWhatsApp('') + '">💬 Parler à CLT sur WhatsApp</a></div>';
    /* On ne RETIRE pas la feuille : le gestionnaire des couches (clt-common) compte les entrées
       d'historique par fenêtre ouverte / fermée ; un élément retiré sans être « fermé » laissait une
       entrée orpheline, et l'Échap suivant faisait sortir de la page (trouvé par le parcours, 25/09). */
    var clore = function () { ov.classList.add('hidden'); ov.setAttribute('hidden', ''); etat.ouvert = false; var b = document.getElementById('clt-assistant-bouton'); if (b) b.setAttribute('aria-expanded', 'false'); };
    ov.querySelector('.clt-assistant__fermer').addEventListener('click', clore);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && etat.ouvert) clore(); });
    ov.addEventListener('click', function (e) { if (e.target === ov) clore(); });
    ov.querySelectorAll('[data-assistant-q]').forEach(function (b) { b.addEventListener('click', function () { repondre(b.dataset.assistantQ); }); });
    ov.querySelector('#clt-assistant-form').addEventListener('submit', function (e) { e.preventDefault(); var c = document.getElementById('clt-assistant-champ'); var q = (c.value || '').trim(); if (!q) return; c.value = ''; repondre(q); });
    ov.addEventListener('click', function (e) {
      var a = e.target.closest('[data-assistant-aller]'); if (a) { clore(); var s = document.getElementById(a.dataset.assistantAller); var nav = document.querySelector('#clt-bottomnav [data-target="' + a.dataset.assistantAller + '"]'); if (nav) nav.click(); else if (s) s.scrollIntoView({ block: 'start' }); return; }
      var o = e.target.closest('[data-assistant-onglet]'); if (o) { clore(); if (typeof showEquipeTab === 'function') showEquipeTab(o.dataset.assistantOnglet); return; }
      if (e.target.closest('[data-aide-ouvrir]')) clore();
    });
    document.body.appendChild(ov);
    etat.ouvert = true;
    setTimeout(function () { try { document.getElementById('clt-assistant-champ').focus(); } catch (e) {} }, 80);
  }
  function brancher() {
    if (document.getElementById('clt-assistant-bouton')) return;
    etat.espace = typeof cltEspaceDeLaPage === 'function' ? cltEspaceDeLaPage() : null;
    if (!etat.espace) return;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'clt-assistant-bouton'; b.className = 'clt-assistant-bouton';
    b.setAttribute('aria-label', 'Assistant CLT : poser une question'); b.setAttribute('aria-expanded', 'false');
    // L'icône universelle de l'assistant (Intercom, Messenger, Crisp) : la bulle de conversation à trois points — pas le casque (Celtis, 26/09).
    b.innerHTML = ICONE_BULLE;
    b.addEventListener('click', function () { if (etat.ouvert) { var o = document.getElementById('clt-assistant'); if (o) { o.classList.add('hidden'); o.setAttribute('hidden', ''); } etat.ouvert = false; b.setAttribute('aria-expanded', 'false'); return; } dessiner(); b.setAttribute('aria-expanded', 'true'); });
    document.body.appendChild(b);
    // Qui parle : posé par la page quand elle connaît la personne (CLTAssistant.personne(id, nom)).
  }
  function personne(id, nom) { etat.moi = id || null; etat.nom = nom || ''; }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', brancher); else brancher(); }
  window.CLTAssistant = { normaliser: normaliser, chercherFiches: chercherFiches, intention: intention, decider: decider, personne: personne, ouvrir: dessiner, SUGGESTIONS: SUGGESTIONS };
})();
