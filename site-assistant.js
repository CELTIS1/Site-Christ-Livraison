/* L'ASSISTANT DU SITE — pour les visiteurs, sans compte (chantier Q, lot S-5, 26 septembre 2026)
   ==========================================================================================
   Le même rond 💬 que dans l'application, en bas à gauche des pages publiques (accueil,
   Vendeuses, Livreurs, Express). Il répond aux questions d'un visiteur — prix, zones, comment
   ça marche, devenir livreur, vendeuses, Express, suivre un colis — avec des réponses écrites
   ici (pas d'IA pour les visiteurs : ni coût, ni abus possible), un lien vers la bonne page,
   et toujours « Parler à CLT sur WhatsApp » avec la question déjà écrite.
   Rien n'est chargé du réseau ; aucune donnée personnelle n'est lue ni envoyée.
   Exposé sur window.CLTSiteAssistant (repondre, normaliser, REPONSES) pour le banc. */
(function () {
  'use strict';
  var WHATSAPP = '2250546818640';
  var ICONE = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H8l-4 3v-3.5A8 8 0 1 1 21 12z"/><circle cx="8.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="12" r="1" fill="currentColor" stroke="none"/></svg>';
  function normaliser(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function contient(texte, s) { return new RegExp('(^| )' + normaliser(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( |$)').test(texte); }
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  /* Les réponses : mots-clés (mots entiers), texte, lien. La première qui marque le plus de points gagne. */
  var REPONSES = [
    { id: 'prix', mots: ['prix', 'tarif', 'tarifs', 'combien', 'coute', 'cout', 'cher', 'fcfa', 'francs'], texte: 'À partir de 1 000 FCFA la livraison en ville, selon la commune. Le tarif est fixé avant la course, sans surprise ; l\'argent de votre vente vous est reversé avec un reçu.', lien: 'tarifs.html', libelle: 'Voir les tarifs' },
    { id: 'zones', mots: ['zone', 'zones', 'commune', 'communes', 'quartier', 'ou', 'livrez', 'cocody', 'yopougon', 'abobo', 'marcory', 'plateau', 'bingerville', 'koumassi', 'adjame', 'treichville', 'port bouet', 'anyama', 'interieur', 'ville', 'bassam'], texte: 'Nous livrons dans toutes les communes d\'Abidjan et ses environs (Bingerville, Anyama, Grand-Bassam, Songon), et nous organisons des envois vers l\'intérieur du pays.', lien: 'index.html#couverture', libelle: 'Zone de couverture' },
    { id: 'comment', mots: ['comment', 'marche', 'fonctionne', 'procedure', 'etapes', 'commencer', 'demarrer', 'inscrire', 'inscription', 'compte'], texte: 'Vous nous écrivez sur WhatsApp, on récupère vos colis chez vous, on livre, on encaisse pour vous et on vous reverse. Vous suivez chaque colis dans votre espace, avec un relevé et des reçus.', lien: 'index.html#comment-ca-marche', libelle: 'Comment ça marche' },
    { id: 'vendeuse', poids: 1, mots: ['fournisseur', 'fournisseurs', 'vendeuse', 'vendeuses', 'vendre', 'vends', 'payee', 'paye', 'boutique', 'commercante', 'commercant', 'client', 'cliente', 'devenir cliente', 'reversement', 'reverse', 'argent', 'encaisse'], texte: 'Vous vendez, on livre et on encaisse pour vous : l\'argent vous revient avec un reçu numéroté, et vous voyez chaque colis en direct. La première livraison est offerte.', lien: 'vendeuses.html', libelle: 'La page Vendeuses' },
    { id: 'livreur', mots: ['livreur', 'livreurs', 'recrutement', 'recrute', 'recrutez', 'embauche', 'travailler', 'emploi', 'job', 'salaire', 'moto', 'chauffeur', 'candidature', 'postuler'], texte: 'Nous recrutons des livreurs à Abidjan : salarié avec moto CLT (150 000 F et primes), salarié avec sa moto, ou indépendant à la course (60 % de chaque course). Écrivez « LIVREUR » sur WhatsApp pour commencer.', lien: 'livreurs.html', libelle: 'Devenir livreur' },
    { id: 'express', mots: ['express', 'urgent', 'urgence', 'immediat', 'tout de suite', 'coursier', 'course', 'maintenant', 'rapide', 'demande'], texte: 'CLT Express, c\'est la course à la demande : vous commandez, un coursier proche accepte, vous suivez la moto en direct et vous donnez un code à 4 chiffres à la remise. Vous payez le prix annoncé, pas plus.', lien: 'express.html', libelle: 'CLT Express' },
    { id: 'suivi', mots: ['suivre', 'suivi', 'ou est mon colis', 'colis', 'numero', 'tracking', 'statut'], texte: 'Chaque colis a un numéro CLT. Sur la page « Suivre un colis », entrez-le avec les 4 derniers chiffres du téléphone du destinataire : vous voyez où il en est.', lien: 'suivi.html', libelle: 'Suivre un colis' },
    { id: 'horaires', mots: ['horaire', 'horaires', 'heure', 'heures', 'ouvert', 'dimanche', 'jour', 'jours', 'delai', 'quand'], texte: 'Nous livrons du lundi au samedi, de 8 h à 19 h ; le dimanche sur demande. Prévenez-nous la veille ou tôt le matin pour une livraison le jour même.', lien: 'index.html#faq', libelle: 'Questions fréquentes' },
    { id: 'paiement', mots: ['payer', 'paiement', 'wave', 'orange money', 'mobile money', 'especes', 'cash', 'momo'], texte: 'Vos clientes paient à la livraison, en espèces ou par mobile money ; CLT vous reverse ensuite en espèces ou par Wave, avec un reçu.', lien: 'vendeuses.html#gagnez', libelle: 'Ce que vous gagnez' },
    { id: 'application', mots: ['application', 'appli', 'app', 'installer', 'telecharger', 'play store', 'iphone', 'android'], texte: 'L\'application CLT s\'installe depuis le site, sans passer par une boutique : ouvrez « Installer l\'application » et suivez les deux étapes. Vos colis, votre relevé et vos reçus y sont.', lien: 'installer.html', libelle: 'Installer l\'application' },
    { id: 'contact', mots: ['contact', 'contacter', 'telephone', 'appeler', 'joindre', 'adresse', 'bureau', 'email', 'mail', 'parler', 'humain', 'quelqu un'], texte: 'Le plus simple : WhatsApp, on répond vite. Vous pouvez aussi nous appeler au +225 05 46 81 86 40.', lien: 'index.html#contact', libelle: 'Nous contacter', humain: true },
    { id: 'perdu', poids: 1, mots: ['perdu', 'perte', 'vole', 'casse', 'abime', 'probleme', 'perd', 'plainte', 'reclamation', 'retard', 'jamais recu', 'rembourse', 'remboursement', 'assurance'], texte: 'Un colis abîmé ou perdu est pris en charge : vous le signalez dans votre espace, le bureau répond et rembourse selon la valeur déclarée. Pour un cas précis, écrivez-nous tout de suite sur WhatsApp.', lien: 'index.html#objections', libelle: 'Nos engagements', humain: true },
    { id: 'entreprise', mots: ['entreprise', 'societe', 'qui', 'propos', 'clt', 'christ', 'histoire', 'equipe', 'gerant', 'sarl', 'officiel'], texte: 'Christ Livraison & Transport SARL est une entreprise ivoirienne de livraison, à Abidjan. christlivraison.ci est notre site officiel ; nos livreurs sont formés, identifiés, et chaque colis est tracé de la récupération à la remise.', lien: 'index.html#a-propos', libelle: 'Qui sommes-nous' },
  ];
  var SUGGESTIONS = { 'index': ['Combien ça coûte ?', 'Comment ça marche ?', 'Vous livrez où ?'], 'vendeuses': ['Comment suis-je payé ?', 'Comment ça marche ?', 'Et si un colis se perd ?'], 'livreurs': ['Combien gagne un livreur ?', 'Comment postuler ?', 'Faut-il sa moto ?'], 'express': ['Comment marche Express ?', 'Combien ça coûte ?', 'Le code à 4 chiffres ?'] };

  function repondre(question) {
    var q = normaliser(question);
    if (!q) return null;
    var meilleur = null, max = 0;
    REPONSES.forEach(function (r) {
      var score = 0;
      r.mots.forEach(function (m) { if (contient(q, m)) score += (m.indexOf(' ') >= 0 ? 3 : 2) + (r.poids || 0); });
      if (score > max) { max = score; meilleur = r; }
    });
    return meilleur;
  }
  function lienWhatsApp(question) {
    return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent('Bonjour CLT, je viens du site. ' + (question ? 'Ma question : ' + question : 'J\'ai une question.'));
  }
  var CSS = '.cs-bouton{position:fixed;left:16px;bottom:calc(22px + env(safe-area-inset-bottom,0px));z-index:9000;width:56px;height:56px;border-radius:50%;border:none;background:#1B4374;color:#fff;box-shadow:0 10px 26px rgba(27,67,116,.35);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s}.cs-bouton:hover{transform:scale(1.06)}.cs-bouton:focus-visible{outline:3px solid #8FB8EC;outline-offset:2px}.cs-bouton svg{display:block}@media(max-width:680px){.cs-bouton{bottom:calc(84px + env(safe-area-inset-bottom,0px))}}' +
    '.cs-feuille{position:fixed;inset:0;z-index:9001;background:rgba(15,23,42,.35);display:flex;align-items:flex-end;justify-content:flex-start;padding:12px}.cs-feuille[hidden]{display:none}.cs-boite{width:min(420px,100%);max-height:min(78vh,640px);background:#fff;color:#1E2A38;border-radius:18px;box-shadow:0 24px 60px rgba(16,40,70,.3);display:flex;flex-direction:column;overflow:hidden;font-family:inherit}@media(min-width:681px){.cs-feuille{padding:0 0 92px 16px}}' +
    '.cs-tete{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #E6EBF1}.cs-avatar{width:40px;height:40px;border-radius:50%;background:#E8F1FB;color:#1B4374;display:flex;align-items:center;justify-content:center;flex:none}.cs-tete strong{display:block;font-size:15px}.cs-tete small{color:#5B6B7C;font-size:12px}.cs-fermer{margin-left:auto;width:44px;height:44px;border:none;background:none;font-size:26px;color:#5B6B7C;cursor:pointer;border-radius:50%}.cs-fermer:hover{background:#F3F6FA}' +
    '.cs-fil{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px}.cs-bulle{max-width:92%;padding:10px 12px;border-radius:14px;font-size:14.5px;line-height:1.45}.cs-bulle--clt{background:#F3F6FA;align-self:flex-start;border-bottom-left-radius:4px}.cs-bulle--moi{background:#1B4374;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}' +
    '.cs-sugg{display:flex;flex-wrap:wrap;gap:8px;padding:0 14px 8px}.cs-q{min-height:40px;padding:8px 12px;border-radius:20px;border:1.5px solid #1B4374;background:#fff;color:#1B4374;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}.cs-q:hover{background:#E8F1FB}' +
    '.cs-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.cs-lien{display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border-radius:22px;background:#1B4374;color:#fff;font-weight:700;font-size:13.5px;text-decoration:none}.cs-lien--wa{background:#25D366}.cs-lien:hover{filter:brightness(1.08)}' +
    '.cs-saisie{display:flex;gap:8px;padding:10px 14px;border-top:1px solid #E6EBF1}.cs-saisie input{flex:1;min-height:44px;padding:0 12px;border:1.5px solid #C7D1DB;border-radius:12px;font:inherit;font-size:15px}.cs-saisie button{min-width:48px;min-height:44px;border:none;border-radius:12px;background:#E26313;color:#fff;font-size:18px;cursor:pointer}.cs-humain{display:block;text-align:center;padding:8px 14px 12px;font-size:13px;color:#1B4374;font-weight:700;text-decoration:none}';

  var etat = { ouvert: false, page: 'index' };
  function pageCourante() { var m = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, ''); return SUGGESTIONS[m] ? m : 'index'; }
  function bulle(html, qui) { return '<div class="cs-bulle cs-bulle--' + qui + '">' + html + '</div>'; }
  function poser(question) {
    var fil = document.getElementById('cs-fil'); if (!fil) return;
    fil.insertAdjacentHTML('beforeend', bulle(esc(question), 'moi'));
    var r = repondre(question);
    var html;
    if (r) {
      html = esc(r.texte) + '<div class="cs-actions"><a class="cs-lien" href="' + esc(r.lien) + '">' + esc(r.libelle) + '</a>' + (r.humain ? '<a class="cs-lien cs-lien--wa" target="_blank" rel="noopener" href="' + lienWhatsApp(question) + '">💬 WhatsApp</a>' : '') + '</div>';
    } else {
      html = 'Je n\'ai pas la réponse ici, mais CLT l\'a : votre question est déjà écrite, il ne reste qu\'à l\'envoyer.<div class="cs-actions"><a class="cs-lien cs-lien--wa" target="_blank" rel="noopener" href="' + lienWhatsApp(question) + '">💬 Parler à CLT sur WhatsApp</a></div>';
    }
    fil.insertAdjacentHTML('beforeend', bulle(html, 'clt'));
    fil.scrollTop = fil.scrollHeight;
  }
  function fermer() { var f = document.getElementById('cs-feuille'); if (f) f.setAttribute('hidden', ''); etat.ouvert = false; var b = document.getElementById('cs-bouton'); if (b) b.setAttribute('aria-expanded', 'false'); }
  function ouvrir() {
    var f = document.getElementById('cs-feuille');
    if (!f) {
      f = document.createElement('div'); f.id = 'cs-feuille'; f.className = 'cs-feuille'; f.setAttribute('role', 'dialog'); f.setAttribute('aria-label', 'Assistant CLT');
      var sugg = SUGGESTIONS[etat.page] || SUGGESTIONS.index;
      f.innerHTML = '<div class="cs-boite">' +
        '<div class="cs-tete"><div class="cs-avatar">' + ICONE.replace('width="28" height="28"', 'width="22" height="22"') + '</div><div><strong>Assistant CLT</strong><small>Je réponds tout de suite ; un humain est à un clic.</small></div><button type="button" class="cs-fermer" data-cs-fermer aria-label="Fermer">×</button></div>' +
        '<div class="cs-fil" id="cs-fil">' + bulle('Bonjour 👋 Que voulez-vous savoir ? Choisissez une question, ou écrivez la vôtre.', 'clt') + '</div>' +
        '<div class="cs-sugg">' + sugg.map(function (s) { return '<button type="button" class="cs-q" data-cs-q="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div>' +
        '<form class="cs-saisie" id="cs-form"><input id="cs-champ" type="text" autocomplete="off" placeholder="Votre question…" aria-label="Votre question"><button type="submit" aria-label="Envoyer">➤</button></form>' +
        '<a class="cs-humain" target="_blank" rel="noopener" href="' + lienWhatsApp('') + '">💬 Parler à CLT sur WhatsApp</a></div>';
      document.body.appendChild(f);
      f.addEventListener('click', function (e) { if (e.target === f || e.target.closest('[data-cs-fermer]')) fermer(); var q = e.target.closest('[data-cs-q]'); if (q) poser(q.dataset.csQ); });
      f.querySelector('#cs-form').addEventListener('submit', function (e) { e.preventDefault(); var c = document.getElementById('cs-champ'); var q = (c.value || '').trim(); if (!q) return; c.value = ''; poser(q); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && etat.ouvert) fermer(); });
    }
    f.removeAttribute('hidden'); etat.ouvert = true;
    var b = document.getElementById('cs-bouton'); if (b) b.setAttribute('aria-expanded', 'true');
    setTimeout(function () { try { document.getElementById('cs-champ').focus(); } catch (e) { /* sans clavier */ } }, 80);
  }
  function brancher() {
    if (document.getElementById('cs-bouton')) return;
    etat.page = pageCourante();
    var style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    var b = document.createElement('button'); b.type = 'button'; b.id = 'cs-bouton'; b.className = 'cs-bouton'; b.setAttribute('aria-label', 'Assistant CLT : poser une question'); b.setAttribute('aria-expanded', 'false'); b.innerHTML = ICONE;
    b.addEventListener('click', function () { if (etat.ouvert) fermer(); else ouvrir(); });
    document.body.appendChild(b);
  }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', brancher); else brancher(); }
  window.CLTSiteAssistant = { repondre: repondre, normaliser: normaliser, REPONSES: REPONSES, SUGGESTIONS: SUGGESTIONS, lienWhatsApp: lienWhatsApp };
})();
