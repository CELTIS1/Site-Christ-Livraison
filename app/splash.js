/* =====================================================================
   Christ Livraison & Transport — Écran d'ouverture (« splash »)
   Ajouté le 2026-08-15. Refonte « élégante & épurée » le 2026-08-15.
   - S'affiche au lancement de l'app (une seule fois par session, donc à
     chaque ouverture de la PWA, pas à chaque navigation interne).
   - Parti pris : SIMPLE, SOFT, PROFESSIONNEL. La vraie icône de l'app
     (celle du logo installé) apparaît en douceur — léger fondu + zoom,
     halo discret qui respire une fois — puis un fondu vers l'app.
   - Le dégradé « signature » s'adapte au rôle de la page.
   À inclure sur chaque page :  <script src="splash.js"></script>
   ===================================================================== */
(function () {
  if (window.__cltSplash) return;
  window.__cltSplash = true;

  // Une seule fois par session (= par ouverture de l'app).
  try {
    if (sessionStorage.getItem('clt-splash-done')) return;
  } catch (e) {}

  // ---- Palette + icône « signature » selon la page/rôle -----------------
  var path = (location.pathname || '').toLowerCase();
  function has(s){ return path.indexOf(s) !== -1; }

  var THEMES = {
    fournisseur:       { g:['#3fd598','#1F9E67','#0e6b42'], glow:'rgba(15,107,66,.55)',  icon:'icon-512-fournisseur.png' },
    equipe:            { g:['#2f6fc4','#1B4374','#0e2a52'], glow:'rgba(14,42,82,.55)',   icon:'icon-512.png' },
    livreur:           { g:['#ff9a40','#EE6A17','#a8460a'], glow:'rgba(168,70,10,.55)',  icon:'icon-512-livreur.png' },
    'express-client':  { g:['#9a63ff','#6D28D9','#45178a'], glow:'rgba(69,23,138,.55)',  icon:'icon-512-client-express.png' },
    'express-coursier':{ g:['#14c2b1','#0D9488','#085249'], glow:'rgba(8,82,73,.55)',    icon:'icon-512-coursier-express.png' },
    gestion:           { g:['#19b8a6','#0F766E','#08433d'], glow:'rgba(8,67,61,.55)',    icon:'icon-512.png' },
    login:             { g:['#2f6fc4','#1B4374','#0e2a52'], glow:'rgba(14,42,82,.55)',   icon:'icon-512.png' }
  };
  var key = has('fournisseur') ? 'fournisseur'
          : has('express-coursier') ? 'express-coursier'
          : has('express-client') ? 'express-client'
          : has('livreur') ? 'livreur'
          : has('gestion') ? 'gestion'
          : has('equipe') ? 'equipe'
          : 'login';
  var T = THEMES[key] || THEMES.login;
  var ICON = '/images/icons/' + T.icon;

  // ---- Feuille de style injectée ---------------------------------------
  var css = ''
  + '#clt-splash{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;'
  +   'align-items:center;justify-content:center;overflow:hidden;'
  +   'background:radial-gradient(120% 110% at 50% 34%, ' + hexA(T.g[0],.16) + ' 0%, rgba(0,0,0,0) 60%),'
  +   'linear-gradient(160deg,' + T.g[0] + ' 0%,' + T.g[1] + ' 54%,' + T.g[2] + ' 100%);'
  +   'opacity:1;transition:opacity .42s ease;'
  +   '-webkit-font-smoothing:antialiased;font-family:Poppins,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}'
  + '#clt-splash.out{opacity:0;pointer-events:none;}'

  /* halo doux qui respire une fois derrière l'icône */
  + '#clt-splash .halo{position:absolute;top:calc(50% - 34px);left:50%;width:300px;height:300px;'
  +   'transform:translate(-50%,-50%);border-radius:50%;pointer-events:none;'
  +   'background:radial-gradient(circle, rgba(255,255,255,.30) 0%, rgba(255,255,255,0) 65%);'
  +   'opacity:0;animation:cltHalo 2.2s ease-out .1s forwards;}'
  + '@keyframes cltHalo{0%{opacity:0;transform:translate(-50%,-50%) scale(.7);}'
  +   '45%{opacity:1;}100%{opacity:0;transform:translate(-50%,-50%) scale(1.25);}}'

  /* icône réelle de l'app */
  + '#clt-splash .ico{width:118px;height:118px;border-radius:28px;display:block;'
  +   'box-shadow:0 20px 55px ' + T.glow + ', 0 4px 14px rgba(0,0,0,.18);'
  +   'opacity:0;transform:translateY(8px) scale(.92);'
  +   'animation:cltIn .85s cubic-bezier(.22,.9,.3,1) .12s forwards;}'
  + '@keyframes cltIn{to{opacity:1;transform:translateY(0) scale(1);}}'

  /* nom + accroche */
  + '#clt-splash .word{margin-top:24px;text-align:center;opacity:0;transform:translateY(10px);'
  +   'animation:cltUp .7s ease .5s forwards;}'
  + '#clt-splash .word .t1{color:#fff;font-weight:700;font-size:21px;letter-spacing:.3px;'
  +   'text-shadow:0 2px 12px rgba(0,0,0,.22);}'
  + '#clt-splash .word .t2{color:rgba(255,255,255,.80);font-weight:500;font-size:12.5px;margin-top:5px;letter-spacing:.3px;}'
  + '@keyframes cltUp{to{opacity:1;transform:translateY(0);}}'

  /* fin barre de chargement discrète */
  + '#clt-splash .load{position:absolute;bottom:12%;left:0;right:0;margin-left:auto;margin-right:auto;'
  +   'width:120px;height:3px;border-radius:3px;background:rgba(255,255,255,.22);overflow:hidden;opacity:0;'
  +   'animation:cltUp .5s ease .9s forwards;}'
  + '#clt-splash .load i{position:absolute;left:50%;top:0;height:100%;width:34%;border-radius:3px;'
  +   'transform:translateX(-50%);background:rgba(255,255,255,.92);'
  +   'animation:cltPulse 1.25s ease-in-out .9s infinite;}'
  + '@keyframes cltPulse{0%,100%{width:22%;opacity:.45;}50%{width:62%;opacity:1;}}'

  + '@media (prefers-reduced-motion: reduce){'
  +   '#clt-splash .halo,#clt-splash .load i{animation:none!important;}'
  +   '#clt-splash .ico{animation:cltIn .01s forwards;}#clt-splash .word{animation:cltUp .01s forwards;}}';

  function hexA(hex, a){
    var m = hex.replace('#',''); if(m.length===3){m=m[0]+m[0]+m[1]+m[1]+m[2]+m[2];}
    var r=parseInt(m.slice(0,2),16), g=parseInt(m.slice(2,4),16), b=parseInt(m.slice(4,6),16);
    return 'rgba('+r+','+g+','+b+','+a+')';
  }

  var st = document.createElement('style');
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  // ---- Construction du DOM ---------------------------------------------
  var wrap = document.createElement('div');
  wrap.id = 'clt-splash';
  wrap.setAttribute('role','img');
  wrap.setAttribute('aria-label','Christ Livraison & Transport');
  wrap.innerHTML =
      '<div class="halo"></div>'
    + '<img class="ico" src="' + ICON + '" alt="" '
    +   'onerror="this.style.display=\'none\'">'
    + '<div class="word"><div class="t1">Christ Livraison &amp; Transport</div>'
    +   '<div class="t2">Livraison &amp; transport · Abidjan</div></div>'
    + '<div class="load"><i></i></div>';

  // On monte l'overlay IMMÉDIATEMENT, sans attendre <body>. Le script est
  // chargé dans <head> (bloquant), donc il s'exécute avant que le contenu de
  // la page ne soit peint : on l'ajoute à <html> pour éviter le « flash »
  // blanc puis le clignotement de la page de connexion avant le splash.
  var root = document.body || document.documentElement;
  root.appendChild(wrap);

  // Fond peint dès maintenant sur <html> UNIQUEMENT pour supprimer le « flash »
  // blanc du tout premier rendu. On le retire dès que l'overlay a été peint
  // (2 rAF) : ainsi, pendant le fondu de sortie, il ne reste aucune bande verte
  // qui « traîne » en bas de l'écran — l'overlay se fond directement sur l'app.
  var prevBg = document.documentElement.style.background;
  document.documentElement.style.background = T.g[1];
  var clearBg = function(){ document.documentElement.style.background = prevBg; };
  if (window.requestAnimationFrame) {
    requestAnimationFrame(function(){ requestAnimationFrame(clearBg); });
  } else { setTimeout(clearBg, 60); }

  // Signale (une seule fois) que l'écran d'ouverture est terminé. Les modules de
  // déverrouillage biométrique écoutent cet événement pour n'afficher l'écran
  // « Espace verrouillé » qu'APRÈS la fin propre du splash — jamais par-dessus.
  function signalSplashEnd(){
    if (window.__cltSplashEnded) return;
    window.__cltSplashEnded = true;
    try { window.dispatchEvent(new Event('clt-splash-end')); } catch(e){}
  }

  var life = 2100;
  setTimeout(function(){
    clearBg();
    wrap.classList.add('out');
    try { sessionStorage.setItem('clt-splash-done','1'); } catch(e){}
    setTimeout(function(){
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      signalSplashEnd();
    }, 430);
  }, life);
})();
