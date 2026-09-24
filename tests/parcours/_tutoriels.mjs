/* OUTIL — LES VIDÉOS DES TUTORIELS (chantier N, lot 16, 25/09/2026). Une caméra.
   Celtis : « un onglet où il y aura des vidéos explicatives, une vidéo pour chaque geste, pour
   qu'il puisse lire et voir ». Chaque geste est REJOUÉ dans un vrai Chromium (390 × 844, le monde
   factice des parcours), avec un sous-titre en haut qui dit ce qu'on fait, et un cercle sur ce
   qu'on touche. Playwright enregistre en WebM ; ffmpeg fait un MP4 léger (H.264, 12 images/s,
   < 1,5 Mo) et une affiche JPEG. Sans voix : ça se lit en 3G et sans son.

   node tests/parcours/_tutoriels.mjs            → toutes les vidéos dans app/aide/videos/
   SEUL=livreur-je-pars node tests/parcours/_tutoriels.mjs   → une seule */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ouvrirNavigateur, dodo, RACINE } from './_navigateur.mjs';
import { nouveauMonde, colis, iso, aujourdhui, ADMIN, LIVREUR, CLIENTE1, CLIENTE2 } from './_monde.mjs';

const SORTIE = path.join(RACINE, 'app', 'aide', 'videos');
const BRUT = path.join(RACINE, 'tests', 'parcours', '_videos-brutes');
fs.mkdirSync(SORTIE, { recursive: true }); fs.mkdirSync(BRUT, { recursive: true });
const demain = (() => { const d = new Date(aujourdhui + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();

/* Le sous-titre et le cercle sont posés dans la page, jamais dans la vidéo après coup : ce qu'on
   voit est exactement l'écran de l'application. */
const STYLE = `#clt-tuto{position:fixed;left:0;right:0;top:0;z-index:99999;background:rgba(27,67,116,.96);color:#fff;font:700 17px/1.3 Inter,system-ui,sans-serif;padding:14px 16px 14px;box-shadow:0 6px 20px rgba(0,0,0,.25);letter-spacing:.01em}
#clt-tuto small{display:block;font-weight:500;font-size:13px;opacity:.85;margin-top:3px}
#clt-tuto-ring{position:fixed;z-index:99998;border:4px solid #E26313;border-radius:50%;box-shadow:0 0 0 6px rgba(226,99,19,.25);pointer-events:none;transition:all .25s;display:none}`;
async function armer(page, titre) {
  await page.addStyleTag({ content: STYLE });
  await page.evaluate((t) => {
    if (!document.getElementById('clt-tuto')) { const d = document.createElement('div'); d.id = 'clt-tuto'; document.body.appendChild(d); const r = document.createElement('div'); r.id = 'clt-tuto-ring'; document.body.appendChild(r); }
    document.getElementById('clt-tuto').innerHTML = t;
  }, titre);
}
async function dire(page, texte, sous) {
  await page.evaluate(([t, s]) => { const d = document.getElementById('clt-tuto'); if (d) d.innerHTML = t + (s ? '<small>' + s + '</small>' : ''); }, [texte, sous || '']);
  await dodo(1700);
}
async function toucher(page, locator, attente) {
  const el = locator.first();
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await dodo(300);
  const b = await el.boundingBox();
  if (b) {
    await page.evaluate(([x, y, w, h]) => { const r = document.getElementById('clt-tuto-ring'); if (!r) return; r.style.display = 'block'; r.style.left = (x - 10) + 'px'; r.style.top = (y - 10) + 'px'; r.style.width = (w + 20) + 'px'; r.style.height = (h + 20) + 'px'; }, [b.x, b.y, b.width, b.height]);
    await dodo(900);
  }
  await el.click();
  await page.evaluate(() => { const r = document.getElementById('clt-tuto-ring'); if (r) r.style.display = 'none'; });
  await dodo(attente || 900);
}
async function taper(page, locator, texte) { await toucher(page, locator, 300); await locator.first().fill(texte); await dodo(700); }

/* Les scénarios : un identifiant (= le nom du fichier), l'espace, le titre, et les gestes. */
const SCENARIOS = [
  { id: 'livreur-je-pars-recupere', espace: 'livreur', titre: 'Partir chez la cliente, puis « Récupéré »', page: 'livreur.html', qui: LIVREUR,
    monde(m) { m.TABLES.colis.push(colis(300, { statut: 'en_attente', fournisseur_id: CLIENTE1, livreur_collecte_id: LIVREUR, created_at: iso(0, 7), description: 'Robe bleue' })); },
    async jouer(p) {
      await dire(p, 'Ma tournée du matin', 'Onglet Récup. : les clientes chez qui passer, dans l\'ordre');
      await toucher(p, p.locator('#clt-bottomnav [data-nav="recup"]'), 1200);
      await dire(p, '1. « Je pars » : la cliente est prévenue', 'L\'heure de départ est notée, le bureau vous voit en route');
      await toucher(p, p.locator('[data-tournee-partir]'), 1500);
      await dire(p, '2. Sur place : « Récupéré, tout »', 'Les colis passent à « récupéré », l\'argent entre dans votre journée');
      await toucher(p, p.locator('[data-tournee-recuperer]'), 800);
      await toucher(p, p.locator('#clt-modal-ok'), 1500);
      await dire(p, '3. Dites combien vous avez pris, puis « Confirmer »', 'Si c\'est moins ou plus que l\'annonce, corrigez le chiffre');
      if (await p.locator('.pris-input').count()) { await taper(p, p.locator('.pris-input'), '1'); await toucher(p, p.locator('[data-tournee-confirmer]'), 1500); }
      await dire(p, 'C\'est fait : le bureau le voit tout de suite', '');
    } },
  { id: 'livreur-livre-photo', espace: 'livreur', titre: 'Livrer un colis, avec la photo de preuve', page: 'livreur.html', qui: LIVREUR,
    monde(m) { m.TABLES.colis.push(colis(301, { statut: 'recupere', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, created_at: iso(0, 7), recupere_at: iso(0, 9), description: 'Sac cuir', montant_article: 12000, montant_livraison: 1500 })); },
    async jouer(p) {
      await dire(p, 'Mes colis : chaque carte a UN geste', 'Le bouton dit l\'étape suivante');
      await toucher(p, p.locator('#clt-bottomnav [data-nav="mes"]'), 1200);
      await dire(p, '1. « Je pars livrer »', 'Le destinataire peut suivre le colis');
      await toucher(p, p.locator('.colis-item [data-etape="en_livraison"]'), 1500);
      await dire(p, '2. Devant la porte : « Livré »', 'Une photo de la remise vous protège en cas de contestation');
      await toucher(p, p.locator('.colis-item [data-etape="livre"]'), 1500);
      if (await p.locator('#clt-modal-ok').isVisible().catch(() => false)) await toucher(p, p.locator('#clt-modal-ok'), 1200);
      await dire(p, 'L\'argent encaissé entre dans « Mon argent »', 'Le soir, vous annoncez votre remise depuis Finance');
    } },
  { id: 'livreur-non-livre-a-rendre', espace: 'livreur', titre: 'Non livré : le motif, puis « À rendre »', page: 'livreur.html', qui: LIVREUR,
    monde(m) { m.TABLES.colis.push(colis(302, { statut: 'en_livraison', fournisseur_id: CLIENTE2, livreur_id: LIVREUR, created_at: iso(0, 7), recupere_at: iso(0, 9), en_livraison_at: iso(0, 10), description: 'Chaussures 42', montant_article: 8000, montant_livraison: 1000, destinataire_telephone: '0707000302' })); },
    async jouer(p) {
      await toucher(p, p.locator('#clt-bottomnav [data-nav="mes"]'), 1000);
      await dire(p, 'Le destinataire n\'est pas là : « Non livré »', 'On vous demande pourquoi — c\'est ce que le bureau lit');
      await toucher(p, p.locator('.colis-item [data-etape="non_livre"]'), 1200);
      await dire(p, 'La course a-t-elle été payée ? Puis le motif', 'Deux appuis, et le bureau sait tout');
      await toucher(p, p.locator('#motif-echec [data-payee="0"]'), 800);
      await toucher(p, p.locator('#motif-echec .motif-echec__motif[data-motif="client_absent"]'), 1200);
      if (await p.locator('#clt-modal-ok').isVisible().catch(() => false)) await toucher(p, p.locator('#clt-modal-ok'), 1200);
      await dire(p, 'Le colis passe dans « À rendre »', 'Deux issues : « Nouvel essai » ou « Je le rapporte à la cliente »');
      await toucher(p, p.locator('#clt-bottomnav [data-nav="retours"]'), 1500);
      await dire(p, 'Rendu le lendemain, deux jours au plus tard', 'La cliente confirme de son côté ; l\'historique garde tout');
    } },
  { id: 'livreur-annoncer-remise', espace: 'livreur', titre: 'Le soir : annoncer ma remise', page: 'livreur.html', qui: LIVREUR,
    monde(m) { m.TABLES.colis.push(colis(303, { statut: 'livre', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, created_at: iso(0, 7), recupere_at: iso(0, 9), livre_at: iso(0, 14), montant_article: 15000, montant_livraison: 2000, encaissement_remis: false })); },
    async jouer(p) {
      await dire(p, 'Finance : l\'argent de ma journée', 'Encaissé − avancé de ma poche = à remettre');
      await toucher(p, p.locator('#clt-bottomnav [data-nav="finance"]'), 1500);
      await dire(p, 'Annoncer ma remise avant d\'arriver au bureau', 'Le bureau compare votre annonce à ce que dit la base');
      const btn = p.locator('[data-annonce-ouvrir], #annonce-remise-bloc button').first();
      if (await btn.count()) { await toucher(p, btn, 1000); const champ = p.locator('#annonce-remise-bloc input[type="number"], #annonce-montant').first(); if (await champ.count()) { await taper(p, champ, '17000'); const ok = p.locator('#annonce-remise-bloc button[type="submit"], #annonce-remise-bloc .btn').last(); await toucher(p, ok, 1200); } }
      await dire(p, 'Au bureau, on compte et on confirme : l\'écart est écrit', '');
    } },
  { id: 'cliente-demander-passage', espace: 'cliente', titre: 'Demander un passage', page: 'fournisseur.html', qui: CLIENTE1,
    monde() {},
    async jouer(p) {
      await dire(p, 'Onglet Ajouter : « Demander un passage »', 'Sans avoir à enregistrer vos colis');
      await toucher(p, p.locator('#clt-bottomnav .nav[data-target="section-ajouter"]'), 800);
      await dire(p, '1. Le jour — « Demain » en un appui', '');
      await toucher(p, p.locator('#passage-demain'), 600);
      await dire(p, '2. Combien de colis, à peu près, et une précision', 'Le bureau retrouve ces deux champs dans sa tournée');
      await taper(p, p.locator('#passage-nb'), '4');
      await taper(p, p.locator('#passage-note'), 'Après 14 h');
      await dire(p, '3. « Demander le passage »', '');
      await toucher(p, p.locator('#passage-envoyer'), 1800);
      await dire(p, 'CLT confirme : vous voyez « Demande vue », puis le livreur', 'Une demande n\'est pas encore une tournée');
    } },
  { id: 'cliente-ajouter-colis', espace: 'cliente', titre: 'Enregistrer un colis moi-même', page: 'fournisseur.html', qui: CLIENTE1,
    monde() {},
    async jouer(p) {
      await toucher(p, p.locator('#clt-bottomnav .nav[data-target="section-ajouter"]'), 800);
      await dire(p, 'Dépliez « Ajouter des colis à partir des photos »', 'Ou « Ajouter un colis sans photo »');
      await toucher(p, p.locator('#ajouter-titre'), 900);
      await toucher(p, p.locator('#lotfr-ligne-vide'), 900);
      await dire(p, 'Destination, téléphone, description, montants', 'La photo de l\'étiquette peut rester attachée au colis');
      const l = p.locator('.lot-ligne').first();
      const champ = (n) => l.locator(n).first();
      if (await champ('[data-champ="destination"], input[placeholder*="ommune"], select').count()) { /* les champs varient : on montre la ligne */ }
      await dodo(1500);
      await dire(p, 'Puis « Enregistrer » : le colis est chez CLT, à récupérer', 'Vous le suivez dans « Mes colis »');
    } },
  { id: 'cliente-suivre-signaler', espace: 'cliente', titre: 'Suivre un colis, signaler un problème', page: 'fournisseur.html', qui: CLIENTE1,
    monde(m) { m.TABLES.colis.push(colis(304, { statut: 'livre', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, created_at: iso(0, 7), recupere_at: iso(0, 8), en_livraison_at: iso(0, 9), livre_at: iso(0, 11), description: 'Pagne wax', montant_article: 15000, montant_livraison: 2000 })); },
    async jouer(p) {
      await dire(p, 'Mes colis : la frise dit où en est chaque colis', 'Aujourd\'hui par défaut ; une date pour le reste');
      await toucher(p, p.locator('#clt-bottomnav .nav[data-target="section-colis"]'), 1200);
      await dire(p, 'Un colis livré : « Détails » puis « Signaler un problème »', '');
      const carte = p.locator('#colis-list .colis-item').first();
      if (await carte.locator('[data-colis-deplier]').count()) await toucher(p, carte.locator('[data-colis-deplier]'), 700);
      if (await carte.locator('[data-signaler]').count()) { await toucher(p, carte.locator('[data-signaler]'), 900); if (await p.locator('.reclam-motif[data-motif="montant_faux"]').count()) await toucher(p, p.locator('.reclam-motif[data-motif="montant_faux"]'), 600); }
      await dire(p, 'Le bureau répond sous votre signalement', 'Dans l\'heure, en général');
    } },
  { id: 'cliente-confirmer-retour', espace: 'cliente', titre: 'Un colis revient : confirmer que je l\'ai reçu', page: 'fournisseur.html', qui: CLIENTE1,
    monde(m) { m.TABLES.colis.push(colis(305, { statut: 'retour', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, created_at: iso(-2, 7), recupere_at: iso(-2, 8), non_livre_at: iso(-2, 15), retour_at: iso(-2, 16), motif_non_livraison: 'client_absent', retour_detenteur: 'cliente', retour_rendu_at: iso(0, 9), retour_rendu_par: LIVREUR, description: 'Sandales' })); },
    async jouer(p) {
      await dire(p, 'Retours : le livreur dit vous avoir rendu ce colis', 'À vous de confirmer — ou de dire non');
      await toucher(p, p.locator('#clt-bottomnav .nav[data-target="section-retours"]'), 1500);
      await dire(p, '« Oui, bien récupéré » clôt le retour', '« Non, je ne l\'ai pas » ouvre un litige que CLT tranche');
      const oui = p.locator('[data-retour-reponse="confirme"], [data-retour-reponse="oui"]').first();
      if (await oui.count()) { await toucher(p, oui, 800); if (await p.locator('#clt-modal-ok').isVisible().catch(() => false)) await toucher(p, p.locator('#clt-modal-ok'), 1200); }
      await dire(p, 'Le retour est clos ; l\'historique garde qui, quand', '');
    } },
  { id: 'equipe-que-faire', espace: 'equipe', titre: '« À traiter » : un non livré, « Que faire ? »', page: 'equipe.html', qui: ADMIN,
    monde(m) { m.TABLES.colis.push(colis(306, { numero: 'CLT-306', statut: 'non_livre', fournisseur_id: CLIENTE2, livreur_id: LIVREUR, created_at: iso(0, 8), recupere_at: iso(0, 9), non_livre_at: iso(0, 14), motif_non_livraison: 'client_absent', destination: 'Rue 12', commune_destination: 'Yopougon', destinataire_telephone: '0707000306' })); },
    async jouer(p) {
      await dire(p, 'À traiter : tout ce qui attend une décision', 'Le plus urgent en premier');
      await p.evaluate(() => showEquipeTab('retours')); await dodo(1500);
      await dire(p, 'Sur la ligne, un seul bouton : « Que faire ? »', '');
      const ligne = p.locator('#retours-liste .rt-ligne[data-rt-id]').first();
      await toucher(p, ligne.locator('[data-rt-quefaire]'), 1200);
      await dire(p, 'Les issues possibles, chacune expliquée', 'Réessayer · le livreur le rapporte · appeler');
      await dodo(1500);
      await toucher(p, ligne.locator('[data-rt-reprog]'), 1200);
      await dire(p, '« Réessayer » : un jour, un livreur, Enregistrer', 'Le colis repart en livraison');
      await toucher(p, ligne.locator('[data-rt-reprog-ok]'), 1800);
    } },
  { id: 'equipe-programmer-demande', espace: 'equipe', titre: 'Une demande de passage : « Programmer »', page: 'equipe.html', qui: ADMIN,
    monde(m) { m.TABLES.demandes_de_passage.push({ id: 'dp-t', jour: demain, fournisseur_id: CLIENTE2, note: 'Après 14 h', nb_colis: 3, statut: 'en_attente' }); },
    async jouer(p) {
      await dire(p, 'Tournées : la demande d\'une cliente, en tête', 'Elle a dit le jour, combien de colis, une note');
      await p.evaluate(() => showEquipeTab('programmation')); await dodo(1000);
      const jour = p.locator('#prog-jour'); await jour.fill(demain); await jour.dispatchEvent('change'); await dodo(1500);
      await dire(p, '« Programmer » remplit le formulaire', 'Cliente, nombre, note : vous ne choisissez que le livreur');
      await toucher(p, p.locator('.btn-demande-programmer'), 1500);
      await p.evaluate(() => document.querySelector('#prog-livreur').scrollIntoView({ block: 'center' })); await dodo(600);
      await p.locator('#prog-livreur').selectOption(LIVREUR); await p.locator('#prog-livreur').dispatchEvent('change'); await dodo(800);
      await dire(p, '« Ajouter à la tournée » : la cliente est prévenue', 'Sa demande passe « traitée » toute seule');
      await toucher(p, p.locator('#btn-prog-ajouter'), 2000);
    } },
  { id: 'equipe-marquer-recuperes', espace: 'equipe', titre: 'Le livreur a pris sans valider : « Marquer récupérés à sa place »', page: 'equipe.html', qui: ADMIN,
    monde(m) { m.TABLES.colis.length = 0; m.TABLES.colis.push(colis(307, { numero: 'CLT-307', statut: 'en_attente', fournisseur_id: CLIENTE1, livreur_collecte_id: LIVREUR, created_at: iso(0, 7) })); },
    async jouer(p) {
      await p.evaluate(() => showEquipeTab('programmation')); await dodo(1500);
      await dire(p, 'La tournée du jour : le livreur est passé, mais n\'a rien validé', 'Vous le savez par téléphone');
      await p.evaluate(() => { const c = document.querySelector('[data-prog-recuperer]'); if (c) c.scrollIntoView({ block: 'center' }); }); await dodo(800);
      await dire(p, '« Marquer récupérés (n) à sa place »', 'Les colis passent « récupéré » au nom du livreur, c\'est tracé');
      await toucher(p, p.locator('[data-prog-recuperer]'), 1000);
      await toucher(p, p.locator('#clt-modal-ok'), 2000);
      await dire(p, 'La carte devient une ligne courte : « récupéré »', '');
    } },
  { id: 'equipe-remise-livreur', espace: 'equipe', titre: 'Argent : la remise du livreur', page: 'equipe.html', qui: ADMIN,
    monde(m) { m.TABLES.colis.push(colis(308, { numero: 'CLT-308', statut: 'livre', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, created_at: iso(0, 7), recupere_at: iso(0, 9), livre_at: iso(0, 14), montant_article: 12000, montant_livraison: 1500, encaissement_remis: false })); m.TABLES.annonces_remise.push({ id: 'an-t', livreur_id: LIVREUR, montant_annonce: 13500, montant_porte: 13500, note: null, remise_id: null, created_at: iso(0, 17) }); },
    async jouer(p) {
      await dire(p, 'Argent › Remise du livreur', 'Qui porte encore de l\'argent, combien, depuis quand');
      await p.evaluate(() => { try { localStorage.removeItem('clt_equipe_argent_vue'); } catch (e) {} showEquipeTab('finances'); }); await dodo(2500);
      await dire(p, '« Marquer comme remis » ouvre la remise', 'Attendu · annoncé par le livreur · reçu · écart');
      await toucher(p, p.locator('[data-argent-remise]'), 1500);
      await dire(p, 'Tapez le montant réellement reçu, puis Enregistrer', 'Un écart est écrit tel quel, jamais caché');
      await taper(p, p.locator('#remise-modal-recu'), '13500');
      await toucher(p, p.locator('#remise-modal-save'), 2000);
    } },
  { id: 'equipe-reverser-cliente', espace: 'equipe', titre: 'Argent : reverser à une cliente', page: 'equipe.html', qui: ADMIN,
    monde(m) { m.TABLES.colis.push(colis(309, { numero: 'CLT-309', statut: 'livre', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, created_at: iso(-3, 7), recupere_at: iso(-3, 9), livre_at: iso(-3, 14), montant_article: 20000, montant_livraison: 2000, encaissement_remis: true, reverse_au_fournisseur_at: null })); },
    async jouer(p) {
      await p.evaluate(() => showEquipeTab('finances')); await dodo(2500);
      await dire(p, 'Argent › Reversement aux clientes', 'Le net dû par cliente, depuis quand, en rouge au-delà de 3 jours');
      await toucher(p, p.locator('[data-argent-vue="reversement"]'), 1500);
      await dire(p, '« Reverser » ouvre la fiche : colis cochés, mode, note', 'Le reçu numéroté part à la cliente');
      await toucher(p, p.locator('[data-argent-reverser]'), 1800);
      await p.evaluate(() => { const b = document.querySelector('#cd-bloc-reverser'); if (b) b.scrollIntoView({ block: 'center' }); }); await dodo(1200);
      await toucher(p, p.locator('#cd-rev-btn'), 900);
      if (await p.locator('#clt-modal-ok').isVisible().catch(() => false)) await toucher(p, p.locator('#clt-modal-ok'), 1800);
      await dire(p, 'C\'est reversé : le reçu est dans « Reçus »', '');
    } },
  { id: 'equipe-dossiers-comptes', espace: 'equipe', titre: 'Une demande de compte : accepter, refuser, joindre', page: 'equipe.html', qui: ADMIN,
    monde(m) { m.TABLES.profiles.push({ id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc8', full_name: 'Sery Koffi', role: 'coursier_express', phone: '2250700000071', status: 'en_attente', avatar_url: null, piece_identite_path: 'x/p.jpg', telephone_verifie_at: iso(0, 8), created_at: iso(0, 7), commune_recuperation: 'Abobo' }); },
    async jouer(p) {
      await dire(p, 'Comptes › Dossiers de comptes', 'En attente · Acceptés · Refusés · Suspendus');
      await p.evaluate(() => showEquipeTab('comptes')); await dodo(1000);
      if (!(await p.locator('#pending-content').evaluate(el => el.classList.contains('open')))) { await p.locator('#section-pending .collapsible-header').click(); await dodo(600); }
      await p.evaluate(() => document.querySelector('#pending-list').scrollIntoView({ block: 'center' })); await dodo(800);
      await dire(p, 'Le dossier : rôle, téléphone, commune, la pièce', 'Appeler · WhatsApp · Voir la pièce');
      await toucher(p, p.locator('.btn-voir-piece'), 1500);
      await p.keyboard.press('Escape'); await dodo(500);
      await dire(p, '« Accepter » ouvre le compte ; « Refuser » demande un motif', 'Rien ne disparaît : le dossier change d\'onglet');
      await toucher(p, p.locator('[data-geste="accepter"]'), 800);
      await toucher(p, p.locator('#clt-modal-ok'), 1500);
      await toucher(p, p.locator('[data-dossiers-segment="acceptes"]'), 1500);
    } },
];

async function enregistrer(sc) {
  const monde = nouveauMonde();
  sc.monde(monde);
  const dossierBrut = path.join(BRUT, sc.id);
  fs.rmSync(dossierBrut, { recursive: true, force: true });
  const N = await ouvrirNavigateur({ monde, contexte: { recordVideo: { dir: dossierBrut, size: { width: 390, height: 844 } } } });
  const { page } = N;
  let erreur = null;
  try {
    await N.ouvrirConnecte(sc.page, sc.qui);
    await dodo(1500);
    await armer(page, sc.titre);
    await dodo(1200);
    await sc.jouer(page);
    await dodo(1500);
  } catch (e) { erreur = e; console.error('  ⚠️ ' + sc.id + ' : ' + (e.message || e).split('\n')[0]); }
  const video = page.video();
  await N.fermer();
  const webm = video ? await video.path() : null;
  if (!webm || !fs.existsSync(webm)) { console.error('  ❌ pas de vidéo pour ' + sc.id); return false; }
  const mp4 = path.join(SORTIE, sc.id + '.mp4');
  const jpg = path.join(SORTIE, sc.id + '.jpg');
  // 12 images/s, H.264 très compressé, faststart pour lire avant d'avoir tout reçu ; l'affiche à 3 s.
  let r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf', 'fps=12,scale=390:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '33', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
  if (r.status !== 0) { console.error('  ❌ ffmpeg : ' + r.stderr); return false; }
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '3', '-i', mp4, '-frames:v', '1', '-q:v', '6', jpg]);
  const taille = fs.statSync(mp4).size;
  const duree = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).stdout.toString().trim();
  console.log(`  🎬 ${sc.id}.mp4 — ${Math.round(taille / 1024)} Ko, ${Math.round(Number(duree))} s${erreur ? ' (scénario interrompu : ' + (erreur.message || '').split('\n')[0].slice(0, 80) + ')' : ''}`);
  return !erreur && taille < 1500000;
}

const seul = process.env.SEUL;
let ok = 0, ko = 0;
for (const sc of SCENARIOS) {
  if (seul && sc.id !== seul) continue;
  console.log('\n' + sc.id + ' — ' + sc.titre);
  (await enregistrer(sc)) ? ok++ : ko++;
}
fs.writeFileSync(path.join(SORTIE, 'index.json'), JSON.stringify({ _lisez_moi: 'Vidéos des tutoriels, fabriquées par tests/parcours/_tutoriels.mjs (Playwright + ffmpeg) : une par geste, 390 × 844, sans voix, sous-titrées dans l\'image.', videos: SCENARIOS.map(s => ({ id: s.id, espace: s.espace, titre: s.titre, url: 'aide/videos/' + s.id + '.mp4', affiche: 'aide/videos/' + s.id + '.jpg' })) }, null, 2) + '\n');
console.log(`\n${ok} vidéo(s) prête(s), ${ko} à revoir.`);
process.exit(ko ? 1 : 0);
