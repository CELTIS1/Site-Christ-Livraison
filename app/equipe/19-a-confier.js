/* ESPACE ÉQUIPE — À CONFIER, l'écran (chantier N, lot 17, 25 septembre 2026)
   ==========================================================================================
   En tête de l'onglet Colis : ce qui attend un livreur, par cliente, le plus ancien en premier.
   Une ligne par cliente = ses colis (cochés d'office, on décoche ce qu'on ne confie pas encore),
   UN choix de livreur, UN bouton « Confier (n) ». L'écriture suit la règle (app/a-confier.js) :
   livreur_id pour un colis récupéré, livreur_collecte_id pour un colis encore chez la cliente ;
   annulable depuis le message ; tracé dans activity_log. Rien d'autre à ouvrir.
   Se recharge quand la saisie enregistre (événement clt:colis-change) et après chaque geste.
   Lit la base directement : la liste de l'onglet ne montre qu'une tranche de dates, alors
   qu'un colis oublié d'avant-hier doit rester ici jusqu'à ce qu'il ait quelqu'un. */
let aConfierGroupes = [];
let aConfierClienteMise = null;   // la cliente à surligner (après un enregistrement de la saisie)

function aConfierNomCliente(id){
  const f = (typeof fournisseurs !== 'undefined' ? fournisseurs : []).find(x => x.id === id);
  return f ? (f.company_name || f.full_name || id) : null;
}

async function chargerAConfier(){
  const box = document.getElementById('a-confier');
  if (!box || !window.CLTAConfier || typeof supabaseClient === 'undefined') return;
  let lignes = [];
  try {
    // Deux lectures simples (récupérés sans livreur de livraison ; en attente sans livreur de
    // collecte) plutôt qu'un « or » imbriqué : lisible, et le monde factice des parcours le parle.
    const champs = 'id, numero, statut, fournisseur_id, livreur_id, livreur_collecte_id, created_at, commune_destination, destination, description';
    const [r1, r2] = await Promise.all([
      supabaseClient.from('colis').select(champs).eq('statut', 'recupere').is('livreur_id', null).order('created_at', { ascending: true }).limit(200),
      supabaseClient.from('colis').select(champs).eq('statut', 'en_attente').is('livreur_collecte_id', null).order('created_at', { ascending: true }).limit(200),
    ]);
    if (r1.error) throw r1.error;
    if (r2.error) throw r2.error;
    lignes = (r1.data || []).concat(r2.data || []);
  } catch (e) { console.warn('À confier :', e); }
  aConfierGroupes = CLTAConfier.groupesAConfier(lignes, { aujourdhui: typeof todayLocalISODate === 'function' ? todayLocalISODate() : new Date().toISOString().slice(0, 10), nomCliente: aConfierNomCliente });
  renderAConfier();
}

function aConfierColisHTML(c){
  const ou = [c.commune_destination, c.destination].filter(Boolean).join(' — ') || (c.description || 'sans destination');
  const etat = c.statut === 'recupere' ? '<span class="confier-etat confier-etat--livrer">à livrer</span>' : '<span class="confier-etat confier-etat--recuperer">chez la cliente</span>';
  return `<label class="confier-colis"><input type="checkbox" data-confier-colis="${escapeHTML(c.id)}" checked><span class="confier-colis-texte"><b>${escapeHTML(c.numero || ('n°' + String(c.id).slice(0, 6)))}</b><span class="confier-colis-ou">${escapeHTML(ou)}</span></span>${etat}</label>`;
}

function renderAConfier(){
  const box = document.getElementById('a-confier');
  if (!box) return;
  const G = aConfierGroupes;
  const auj = typeof todayLocalISODate === 'function' ? todayLocalISODate() : '';
  if (!G.length) {
    box.innerHTML = '<div class="confier-vide">✅ Tout a un livreur. Les colis enregistrés sans livreur apparaîtront ici, prêts à confier.</div>';
    return;
  }
  const options = '<option value="">Choisir le livreur…</option>' + (typeof livreurs !== 'undefined' ? livreurs : []).map(l => `<option value="${escapeHTML(l.id)}">${escapeHTML(l.full_name || l.id)}</option>`).join('');
  const html = `<div class="confier-entete"><div class="confier-titre">🛵 À confier</div><div class="confier-sous">${escapeHTML(CLTAConfier.resume(G, auj))}</div></div>
  ${G.map(g => `<div class="confier-groupe${g.enRetard ? ' confier-retard' : ''}${aConfierClienteMise === g.fournisseur_id ? ' confier-mise' : ''}" data-confier-cliente="${escapeHTML(g.fournisseur_id)}">
    <div class="confier-groupe-tete"><span class="confier-nom">${escapeHTML(g.nom)}</span><span class="confier-compte">${g.nb} colis${g.enRetard ? ' · <b>depuis ' + escapeHTML(typeof formatDate === 'function' ? formatDate(g.depuis) : String(g.depuis).slice(0, 10)) + '</b>' : ''}</span></div>
    <div class="confier-liste">${g.colis.map(aConfierColisHTML).join('')}</div>
    <div class="confier-gestes"><select class="confier-livreur" data-confier-livreur data-recherche data-recherche-placeholder="Nom du livreur…">${options}</select><button type="button" class="btn btn-sm confier-ok" data-confier-ok="${escapeHTML(g.fournisseur_id)}">Confier (${g.nb})</button></div>
  </div>`).join('')}`;
  if (typeof cltPoserHTML === 'function') cltPoserHTML(box, html); else box.innerHTML = html;
  if (aConfierClienteMise) {
    const cible = box.querySelector('.confier-mise');
    if (cible && !aConfierMiseDefilee) { cible.scrollIntoView({ block: 'center', behavior: 'smooth' }); aConfierMiseDefilee = true; }
    // Le surlignage tient six secondes, même si le bloc est redessiné entre-temps (deux lectures
    // peuvent se croiser : l'ouverture de l'onglet et l'événement de la saisie).
    clearTimeout(aConfierMiseTimer);
    aConfierMiseTimer = setTimeout(() => { aConfierClienteMise = null; aConfierMiseDefilee = false; box.querySelectorAll('.confier-mise').forEach(el => el.classList.remove('confier-mise')); }, 6000);
  }
}
let aConfierMiseTimer = null, aConfierMiseDefilee = false;

/* Montrer le bloc (depuis L'essentiel « à confier », ou juste après un enregistrement de la
   saisie) : l'onglet Colis, le bloc en vue, la cliente surlignée. */
function aConfierMontrer(fournisseurId){
  aConfierClienteMise = fournisseurId || null; aConfierMiseDefilee = false;
  if (typeof showEquipeTab === 'function') showEquipeTab('colis');
  chargerAConfier().then(() => {
    const box = document.getElementById('a-confier');
    if (box && !aConfierClienteMise) box.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}

async function aConfierConfier(bouton){
  const groupe = bouton.closest('[data-confier-cliente]');
  const g = aConfierGroupes.find(x => x.fournisseur_id === groupe.dataset.confierCliente);
  if (!g) return;
  const select = groupe.querySelector('[data-confier-livreur]');
  const livreurId = select ? select.value : '';
  if (!livreurId) { cltToast('Choisissez d\'abord le livreur, juste à côté du bouton.', { type: 'warning' }); if (select) select.focus(); return; }
  const coches = new Set(Array.from(groupe.querySelectorAll('[data-confier-colis]:checked')).map(i => i.dataset.confierColis));
  const choisis = g.colis.filter(c => coches.has(c.id));
  const ecritures = CLTAConfier.ecrituresPourConfier(choisis, livreurId);
  if (!ecritures.length) { cltToast('Cochez au moins un colis.', { type: 'info' }); return; }
  if (!navigator.onLine) { cltToast('Sans réseau, on ne confie pas à moitié : réessayez au retour de la connexion.', { type: 'warning', title: 'Hors connexion' }); return; }
  const nom = ((typeof livreurs !== 'undefined' ? livreurs : []).find(l => l.id === livreurId) || {}).full_name || 'ce livreur';
  const libelle = bouton.innerHTML; bouton.disabled = true; bouton.textContent = 'Enregistrement…';
  const avant = choisis.map(c => ({ id: c.id, livreur_id: c.livreur_id || null, livreur_collecte_id: c.livreur_collecte_id || null }));
  let erreur = null;
  for (const e of ecritures) {
    const { error } = await supabaseClient.from('colis').update({ [e.champ]: e.livreur_id }).in('id', e.ids);
    if (error) { erreur = error; break; }
  }
  bouton.disabled = false; bouton.innerHTML = libelle;
  if (erreur) { cltToast(friendlyErrorMessage(erreur.message), { type: 'error' }); return; }
  supabaseClient.from('activity_log').insert([{ action: 'colis_confies', target_id: livreurId, target_type: 'profiles', details: { livreur: nom, cliente: g.nom, colis: ecritures.flatMap(e => e.ids), champs: ecritures.map(e => e.champ + ':' + e.ids.length) } }]).then(() => {}, () => {});
  // La liste de l'onglet, si elle porte ces colis, suit sans rechargement.
  if (typeof allColis !== 'undefined') ecritures.forEach(e => e.ids.forEach(id => { const x = allColis.find(c => c.id === id); if (x) x[e.champ] = e.livreur_id; }));
  if (typeof renderColis === 'function') renderColis();
  cltToast(CLTAConfier.phraseConfie(ecritures, nom), {
    type: 'success', title: 'C\'est confié', duration: 9000,
    action: { label: '↩️ Annuler', onClick: () => aConfierAnnuler(avant) },
  });
  chargerAConfier();
}

async function aConfierAnnuler(avant){
  for (const e of avant) {
    await supabaseClient.from('colis').update({ livreur_id: e.livreur_id, livreur_collecte_id: e.livreur_collecte_id }).eq('id', e.id);
    if (typeof allColis !== 'undefined') { const x = allColis.find(c => c.id === e.id); if (x) { x.livreur_id = e.livreur_id; x.livreur_collecte_id = e.livreur_collecte_id; } }
  }
  if (typeof renderColis === 'function') renderColis();
  cltToast(avant.length + ' colis remis « à confier ».', { type: 'info', title: 'Annulé' });
  chargerAConfier();
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-confier-ok]');
  if (b) aConfierConfier(b);
});
// Le compte sur le bouton suit les cases.
document.addEventListener('change', (e) => {
  if (!e.target.matches('[data-confier-colis]')) return;
  const groupe = e.target.closest('[data-confier-cliente]');
  const n = groupe.querySelectorAll('[data-confier-colis]:checked').length;
  const b = groupe.querySelector('[data-confier-ok]');
  if (b) { b.textContent = 'Confier (' + n + ')'; b.disabled = n === 0; }
});
document.addEventListener('clt:colis-change', () => { chargerAConfier(); });
window.aConfierMontrer = aConfierMontrer;
window.chargerAConfier = chargerAConfier;
