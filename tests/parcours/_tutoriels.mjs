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
import { nouveauMonde, colis, iso, aujourdhui, ADMIN, LIVREUR, CLIENTE1, CLIENTE2, CLIENT_EXPRESS } from './_monde.mjs';

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
  if (process.env.TUTO_DEBUG) console.log('    · toucher', String(locator).slice(0, 90), 'visible=' + await el.isVisible().catch(() => 'err'));
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await dodo(300);
  const b = await el.boundingBox();
  if (b) {
    await page.evaluate(([x, y, w, h]) => { const r = document.getElementById('clt-tuto-ring'); if (!r) return; r.style.display = 'block'; r.style.left = (x - 10) + 'px'; r.style.top = (y - 10) + 'px'; r.style.width = (w + 20) + 'px'; r.style.height = (h + 20) + 'px'; }, [b.x, b.y, b.width, b.height]);
    await dodo(900);
  }
  // Un clic Playwright peut être intercepté par une couche au-dessus (dossier Express + fenêtre de confirmation) :
  // après 5 s, on clique par le DOM sur l'élément visible — l'image montre la même chose (26/09).
  try { await el.click({ timeout: 5000 }); }
  catch (e) { const ok = await el.evaluate((n) => { if (!n.getBoundingClientRect().width) return false; n.click(); return true; }).catch(() => false); if (!ok) throw e; }
  await page.evaluate(() => { const r = document.getElementById('clt-tuto-ring'); if (r) r.style.display = 'none'; });
  await dodo(attente || 900);
}
async function taper(page, locator, texte) { await toucher(page, locator, 300); await locator.first().fill(texte); await dodo(700); }

/* Un coursier Express pour les scénarios Express (25/09/2026). */
const COURSIER_TUTO = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
function coursierDuMonde(m, extra) {
  m.PROFILS.push(Object.assign({ id: COURSIER_TUTO, full_name: 'Sery Coursier', role: 'coursier_express', phone: '2250700000031', status: 'valide', company_name: null, avatar_url: null, disponible_express: true, suppression_demandee_at: null, geoloc_consent_at: iso(-3), telephone_verifie_at: iso(-10) }, extra || {}));
  (m.TABLES.express_wallets ||= []).push({ coursier_id: COURSIER_TUTO, solde: 2000 });
}

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
      await dire(p, 'Le retour est clos ; l\'historique garde qui, quand', 'Rien ne s\'efface : la date, l\'heure, la photo');
      await dodo(2000);
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
  /* ---- 25/09/2026 (demande de Celtis) : les gestes qui manquaient, dans tous les espaces ---- */
  { id: 'livreur-rendre-retour', espace: 'livreur', titre: 'Un colis revenu : le rendre à la cliente', page: 'livreur.html', qui: LIVREUR,
    monde(m) { m.TABLES.colis.push(colis(310, { statut: 'retour', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, created_at: iso(-1, 7), recupere_at: iso(-1, 9), non_livre_at: iso(-1, 15), retour_at: iso(-1, 16), motif_non_livraison: 'client_absent', description: 'Sandales 38', montant_article: 6000, montant_livraison: 1000 })); },
    async jouer(p) {
      await dire(p, '« À rendre » : les colis revenus, cliente par cliente', 'Rendu le lendemain, deux jours au plus tard');
      await toucher(p, p.locator('#clt-bottomnav [data-nav="retours"]'), 1500);
      await dire(p, 'Chez la cliente : « Rendu à la cliente »', 'Une photo de la remise, si vous pouvez');
      const b = p.locator('[data-etape="retour"][data-geste="rendu_cliente"]').first();
      if (await b.count()) { await toucher(p, b, 1000); if (await p.locator('#clt-modal-ok').isVisible().catch(() => false)) await toucher(p, p.locator('#clt-modal-ok'), 1500); }
      await dire(p, 'La cliente confirme de son côté ; le retour est clos', '« Déposé au bureau » si vous ne pouvez pas passer');
    } },
  { id: 'livreur-reporter', espace: 'livreur', titre: 'Reporter un colis à demain', page: 'livreur.html', qui: LIVREUR,
    monde(m) { m.TABLES.colis.push(colis(311, { statut: 'recupere', fournisseur_id: CLIENTE2, livreur_id: LIVREUR, created_at: iso(0, 7), recupere_at: iso(0, 9), description: 'Ensemble enfant', montant_article: 9000, montant_livraison: 1500, destinataire_telephone: '2250701020399' })); },
    async jouer(p) {
      await toucher(p, p.locator('#clt-bottomnav [data-nav="mes"]'), 1200);
      await dire(p, 'Le destinataire demande demain : « Plus d\'options », puis « Reporter »', 'Le colis sort du point de ce soir, sans être « non livré »');
      await toucher(p, p.locator('.colis-item details.colis-plus summary').first(), 900);
      const b = p.locator('.colis-item [data-reporter]').first();
      if (await b.count()) { await toucher(p, b, 1200); const ok = p.locator('#clt-modal-ok'); if (await ok.isVisible().catch(() => false)) await toucher(p, ok, 1500); }
      await dire(p, 'Demain, il revient dans « Ma journée », marqué « reporté »', 'Le bureau voit le report et son motif');
    } },
  { id: 'cliente-releve', espace: 'cliente', titre: 'Mon relevé : ce que CLT me doit', page: 'fournisseur.html', qui: CLIENTE1,
    monde(m) { m.TABLES.colis.push(colis(312, { statut: 'livre', fournisseur_id: CLIENTE1, livreur_id: LIVREUR, created_at: iso(-1, 7), recupere_at: iso(-1, 8), livre_at: iso(-1, 11), description: 'Robe', montant_article: 15000, montant_livraison: 2000 })); },
    async jouer(p) {
      await dire(p, 'Relevé : vos ventes livrées, et ce que CLT vous reverse', 'Livré − frais de livraison = net dû');
      // Le relevé est sous l'onglet « Récap » (pas d'onglet « Relevé » dans la barre du bas) — corrigé le 26/09.
      await toucher(p, p.locator('#clt-bottomnav .nav[data-target="section-recap"]'), 1500);
      await p.evaluate(() => { const s = document.getElementById('section-releve'); if (s) s.scrollIntoView({ block: 'start' }); }); await dodo(1200);
      await toucher(p, p.locator('#releve-details summary'), 1800);
      await p.evaluate(() => { const s = document.getElementById('section-releve'); if (s) s.scrollIntoView({ block: 'start' }); }); await dodo(1200);
      await dire(p, 'Chaque reversement a son reçu numéroté', 'Vous le retrouvez ici, avec la date et le mode');
      await p.evaluate(() => { const s = document.getElementById('releve-tiles'); if (s) s.scrollIntoView({ block: 'center' }); }); await dodo(2500);
    } },
  { id: 'equipe-creer-confier', espace: 'equipe', titre: 'Créer un colis, puis le confier à un livreur', page: 'equipe.html', qui: ADMIN,
    monde(m) { m.TABLES.programmations_collecte = m.TABLES.programmations_collecte.filter(x => x.fournisseur_id !== CLIENTE1); },
    async jouer(p) {
      await p.evaluate(() => showEquipeTab('colis')); await dodo(1500);
      await dire(p, 'Colis › « Ajouter un colis sans photo »', 'Téléphone, article, livraison : trois champs');
      await p.locator('#section-lot-colis summary').evaluate(s => { s.parentElement.open = true; }); await dodo(600);
      await p.locator('#lot-fournisseur').selectOption(CLIENTE1); await p.locator('#lot-fournisseur').dispatchEvent('change'); await dodo(500);
      await toucher(p, p.locator('#lot-ligne-vide'), 800);
      await p.locator('#lot-livreur-collecte').selectOption(''); await p.locator('#lot-livreur-collecte').dispatchEvent('change');
      const l = p.locator('#lot-lignes .lot-ligne').first();
      await taper(p, l.locator('.lot-tel'), '0709090901'); await taper(p, l.locator('.lot-art'), '12000'); await taper(p, l.locator('.lot-liv'), '1500');
      await dire(p, '« Enregistrer » : le colis est chez CLT, à confier', '');
      await toucher(p, p.locator('#lot-enregistrer'), 2500);
      await dire(p, 'En tête de l\'onglet : « À confier », par cliente', 'Choisissez le livreur, « Confier »');
      await p.evaluate(() => { const b = document.getElementById('a-confier'); if (b) b.scrollIntoView({ block: 'start' }); }); await dodo(1200);
      const sel = p.locator('#a-confier [data-confier-livreur]').first();
      if (await sel.count()) { await sel.selectOption(LIVREUR); await sel.dispatchEvent('change'); await dodo(600); await toucher(p, p.locator('#a-confier [data-confier-ok]').first(), 1500); if (await p.locator('#clt-modal-ok').isVisible().catch(() => false)) await toucher(p, p.locator('#clt-modal-ok'), 1500); }
      await dire(p, 'Le livreur le voit dans « Mes colis »', '');
    } },
  { id: 'equipe-express-dossier', espace: 'equipe', titre: 'CLT Express : le dossier d\'une course, attribuer', page: 'equipe.html', qui: ADMIN,
    monde(m) { coursierDuMonde(m); m.TABLES.express_courses.push({ id: 'c-tuto', client_id: CLIENT_EXPRESS, coursier_id: null, status: 'en_attente', adresse_recuperation: 'Adjamé — Marché', adresse_livraison: 'Cocody — Riviera 3', description_colis: 'Un carton', created_at: iso(0, 8), prix_total: 1216, commission_montant: 182, montant_coursier: 1034, distance_km: 4.8 }); },
    async jouer(p) {
      await dire(p, 'Express › Courses : chaque course a un « Dossier »', 'Chronologie, argent, chat, preuve, gestes');
      await p.evaluate(() => showEquipeTab('express')); await dodo(1500);
      await p.evaluate(() => { const b = document.querySelector('[data-express-dossier="c-tuto"]'); if (b) b.scrollIntoView({ block: 'center' }); }); await dodo(800);
      await toucher(p, p.locator('[data-express-dossier="c-tuto"]'), 1500);
      await dire(p, 'Une course sans coursier : « Attribuer à un coursier »', 'Choisissez-le, puis le bouton ; il est prévenu');
      const dos = p.locator('#express-dossier');
      await p.evaluate(() => { const g = document.querySelector('#express-dossier .express-geste'); if (g) g.scrollIntoView({ block: 'center' }); }); await dodo(600);
      await toucher(p, dos.locator('[data-express-geste="attribuer"]'), 600);
      await dos.locator('.express-geste__coursier').selectOption(COURSIER_TUTO); await dos.locator('.express-geste__coursier').dispatchEvent('change'); await dodo(500);
      await toucher(p, dos.locator('[data-express-geste="attribuer"]'), 1200);
      if (await p.locator('#clt-modal-ok').isVisible().catch(() => false)) await toucher(p, p.locator('#clt-modal-ok'), 1800); else await dodo(1200);
      await dire(p, 'Acceptée à son nom, tracée « par le bureau »', 'Les gestes suivants : récupérée, livrée, annuler');
    } },
  { id: 'equipe-litiges-express', espace: 'equipe', titre: 'Un litige Express : je m\'en occupe, je réponds', page: 'equipe.html', qui: ADMIN,
    monde(m) { coursierDuMonde(m); m.TABLES.express_courses.push({ id: 'c-lit', client_id: CLIENT_EXPRESS, coursier_id: COURSIER_TUTO, status: 'livree', adresse_recuperation: 'Adjamé — Marché', adresse_livraison: 'Cocody — Riviera 3', description_colis: 'Un carton', created_at: iso(0, 8), accepted_at: iso(0, 8), recuperee_at: iso(0, 9), delivered_at: iso(0, 10), prix_total: 1216, commission_montant: 182, montant_coursier: 1034, commission_reglee: true, distance_km: 4.8 }); m.TABLES.express_reclamations.push({ id: 'lit-t', course_id: 'c-lit', auteur_id: CLIENT_EXPRESS, auteur_role: 'client_express', motif: 'colis_abime', texte: 'Le carton est arrivé écrasé', statut: 'ouverte', created_at: iso(0, 11) }); },
    async jouer(p) {
      await dire(p, 'À traiter › « Litiges Express »', 'Qui, le motif, le mot du client, la course');
      await p.evaluate(() => showEquipeTab('retours')); await dodo(1500);
      await toucher(p, p.locator('[data-rt-vue="litiges"]'), 1200);
      const ligne = p.locator('#retours-liste .rt-ligne[data-litige]').first();
      await toucher(p, ligne.locator('[data-rt-quefaire]'), 1200);
      await dire(p, '« Je m\'en occupe » : le client voit « pris en charge »', '« Ouvrir le dossier » donne tout pour trancher');
      await toucher(p, ligne.locator('[data-litige-geste="en_cours"]'), 1800);
      const ligne2 = p.locator('#retours-liste .rt-ligne[data-litige]').first();
      if (!(await ligne2.locator('[data-litige-geste]').count())) await toucher(p, ligne2.locator('[data-rt-quefaire]'), 800);
      await dire(p, '« Répondre et clore » : votre phrase, lue sous son signalement', '');
      await toucher(p, ligne2.locator('[data-litige-geste="resolue"]'), 800);
      await taper(p, p.locator('#clt-modal-input'), 'Vu la photo : la course vous est remboursée demain.');
      await toucher(p, p.locator('#clt-modal-ok'), 1800);
    } },
  { id: 'equipe-coursiers-express', espace: 'equipe', titre: 'Les coursiers Express : note, suspendre, lever', page: 'equipe.html', qui: ADMIN,
    monde(m) { coursierDuMonde(m); [4, 5, 3, 2, 3, 3, 2, 3, 3, 3].forEach((n, i) => m.TABLES.express_courses.push({ id: 'n-' + i, client_id: CLIENT_EXPRESS, coursier_id: COURSIER_TUTO, status: 'livree', adresse_recuperation: 'A', adresse_livraison: 'B', created_at: iso(-9 + i, 8), delivered_at: iso(-9 + i, 10), prix_total: 900, commission_montant: 135, montant_coursier: 765, commission_reglee: true, distance_km: 2, note_client: n })); },
    async jouer(p) {
      await dire(p, 'Express › « Coursiers » : la note sur les 10 dernières courses', 'Bon · À surveiller (sous 3,5) · Suspendu (sous 3)');
      await p.evaluate(() => showEquipeTab('express')); await dodo(1500);
      await p.evaluate(() => { const c = document.getElementById('express-coursiers-content'); if (c && !c.classList.contains('open')) toggleSection(document.querySelector('#section-express-coursiers .collapsible-header'), 'express-coursiers-content'); document.getElementById('section-express-coursiers').scrollIntoView({ block: 'start' }); }); await dodo(1500);
      await dire(p, '« Suspendre » demande un motif, lu par le coursier', 'Il ne peut plus accepter de course');
      await toucher(p, p.locator('#express-coursiers-list [data-coursier-suspendre]').first(), 800);
      await taper(p, p.locator('#clt-modal-input'), 'Colis ouvert, deux plaintes');
      await toucher(p, p.locator('#clt-modal-ok'), 1800);
      await dire(p, 'Après l\'appel : « Lever la suspension »', 'Si la note reste sous 3, la base le suspendra à la prochaine note');
      await toucher(p, p.locator('#express-coursiers-list [data-coursier-lever]').first(), 800);
      await toucher(p, p.locator('#clt-modal-ok'), 1800);
    } },
  { id: 'equipe-sans-coursier', espace: 'equipe', titre: 'Une course que personne ne prend', page: 'equipe.html', qui: ADMIN,
    monde(m) { coursierDuMonde(m); m.TABLES.express_courses.push({ id: 'c-sc', client_id: CLIENT_EXPRESS, coursier_id: null, status: 'en_attente', adresse_recuperation: 'Abobo — Gare', adresse_livraison: 'Cocody — Riviera', description_colis: 'Un carton', created_at: iso(0, 8), dispatch_vague: 3, dispatch_rayon_km: 12, bureau_alerte_at: iso(0, 8.3), prix_total: 1216, commission_montant: 182, montant_coursier: 1034, distance_km: 4.8 }); },
    async jouer(p) {
      await dire(p, 'Personne n\'a accepté après trois vagues : le bureau est alerté', 'À traiter › « Sans coursier »');
      await p.evaluate(() => showEquipeTab('retours')); await dodo(1500);
      await toucher(p, p.locator('[data-rt-vue="sans_coursier"]'), 1200);
      const ligne = p.locator('#retours-liste .rt-ligne[data-course-sans-coursier]').first();
      await toucher(p, ligne.locator('[data-rt-quefaire]'), 1200);
      await dire(p, '« Ouvrir le dossier » : attribuer à un coursier, ou annuler', '« Appeler le client » pour le prévenir');
      await toucher(p, ligne.locator('[data-course-geste="dossier"]'), 1800);
      await p.evaluate(() => { const g = document.querySelector('#express-dossier .express-geste'); if (g) g.scrollIntoView({ block: 'center' }); }); await dodo(1500);
    } },
  { id: 'express-commander', espace: 'express-client', titre: 'Commander une course', page: 'express-client.html', qui: CLIENT_EXPRESS,
    monde(m) { m.DRAPEAUX.exigerConditions = true; },
    async jouer(p) {
      await dire(p, 'La première fois : les conditions, sept lignes', '« J\'ai lu et j\'accepte »');
      await toucher(p, p.locator('#conditions-feuille .conditions-accepter'), 1500);
      await dire(p, '1. D\'où, vers où : la commune, puis l\'adresse', 'Posez une épingle si vous pouvez : le coursier arrive droit');
      await p.evaluate(() => { const s = document.getElementById('course-pickup-commune'); s.value = 'Adjamé'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await dodo(500);
      await taper(p, p.locator('#course-pickup-adresse'), 'Marché, porte 3');
      await p.evaluate(() => { const s = document.getElementById('course-dropoff-commune'); s.value = 'Cocody'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await dodo(500);
      await taper(p, p.locator('#course-dropoff-adresse'), 'Riviera 3, immeuble Alpha');
      await dire(p, '2. Qui reçoit : le nom et le téléphone', 'Le coursier l\'appelle en arrivant');
      await taper(p, p.locator('#course-dest-nom'), 'Koffi'); await taper(p, p.locator('#course-dest-tel'), '0701020304');
      await dire(p, '3. Le colis : quoi, sa valeur, rien d\'interdit', 'Jusqu\'à 50 000 F ; au-dessus, appelez CLT');
      await taper(p, p.locator('#course-description'), 'Une enveloppe de documents');
      await taper(p, p.locator('#course-valeur'), '15000');
      await toucher(p, p.locator('#course-objets-ok'), 800);
      await dire(p, '4. Le prix s\'affiche ; « Commander », puis confirmer', '');
      await toucher(p, p.locator('#btn-new-course'), 900);
      await toucher(p, p.locator('#clt-modal-ok'), 2000);
      await dire(p, 'Un coursier proche est prévenu ; vous suivez tout dans « Mes courses »', '');
    } },
  { id: 'express-suivre-code', espace: 'express-client', titre: 'Suivre ma course, donner le code de livraison', page: 'express-client.html', qui: CLIENT_EXPRESS,
    monde(m) { coursierDuMonde(m); m.TABLES.express_courses.push({ id: 'c-suivi', client_id: CLIENT_EXPRESS, coursier_id: COURSIER_TUTO, status: 'acceptee', adresse_recuperation: 'Adjamé — Marché', adresse_livraison: 'Cocody — Riviera 3', description_colis: 'Une enveloppe', created_at: iso(0, 8), accepted_at: iso(0, 8), latitude_recuperation: 5.35, longitude_recuperation: -4.02, latitude_livraison: 5.36, longitude_livraison: -3.99, prix_total: 1216, commission_montant: 182, montant_coursier: 1034, distance_km: 4.8 }); m.TABLES.express_codes_livraison.push({ course_id: 'c-suivi', code: '0472', created_at: iso(0, 8) }); },
    async jouer(p) {
      await dire(p, 'Mes courses : la frise dit où en est le coursier', 'Acceptée → récupérée → livrée');
      await toucher(p, p.locator('#clt-bottomnav [data-target="section-courses"]'), 1500);
      await dire(p, 'Le coursier : son nom, appeler, WhatsApp, sa note', 'Et sa position sur la carte pendant la course');
      await dodo(1500);
      await dire(p, 'Le code de livraison : 4 chiffres à donner à la personne qui reçoit', 'Le coursier les demande à la remise — c\'est votre preuve');
      await p.evaluate(() => { const e = document.querySelector('.preuve-code'); if (e) e.scrollIntoView({ block: 'center' }); }); await dodo(2000);
      await dire(p, '« Discuter avec le coursier » pour une précision', '');
      const chat = p.locator('[data-chat-toggle]').first(); if (await chat.count()) await toucher(p, chat, 1500);
    } },
  { id: 'express-signaler-noter', espace: 'express-client', titre: 'Après la livraison : noter, ou signaler un problème', page: 'express-client.html', qui: CLIENT_EXPRESS,
    monde(m) { coursierDuMonde(m); m.TABLES.express_courses.push({ id: 'c-fin', client_id: CLIENT_EXPRESS, coursier_id: COURSIER_TUTO, status: 'livree', adresse_recuperation: 'Adjamé — Marché', adresse_livraison: 'Cocody — Riviera 3', description_colis: 'Une enveloppe', created_at: iso(0, 8), accepted_at: iso(0, 8), recuperee_at: iso(0, 9), delivered_at: iso(0, 10), preuve_type: 'code', preuve_at: iso(0, 10), prix_total: 1216, commission_montant: 182, montant_coursier: 1034, commission_reglee: true, distance_km: 4.8 }); },
    async jouer(p) {
      await toucher(p, p.locator('#clt-bottomnav [data-target="section-courses"]'), 1200);
      await p.evaluate(() => document.querySelectorAll('details.courses-terminees').forEach(d => { d.open = true; })); await dodo(800);
      await dire(p, 'Une course livrée est sous « Terminées » : notez le coursier', 'Sa note aide les autres clients');
      const etoile = p.locator('.rating-block .star').nth(4); if (await etoile.count()) { await toucher(p, etoile, 600); const env = p.locator('.rating-block .rating-submit').first(); if (await env.count()) await toucher(p, env, 1500); }
      await dire(p, 'Un problème ? « ⚠️ Signaler un problème »', 'Un motif, un mot ; CLT répond sous la course dans les 24 h');
      await toucher(p, p.locator('[data-litige-signaler]').first(), 900);
      await toucher(p, p.locator('#litige-feuille .litige-motif[data-motif="colis_abime"]'), 700);
      await taper(p, p.locator('#litige-feuille .litige-texte'), 'Le carton est arrivé écrasé');
      await toucher(p, p.locator('#litige-feuille .litige-envoyer'), 1800);
      await dire(p, '« Signalement reçu » : la réponse du bureau viendra ici', '');
    } },
  { id: 'coursier-accepter', espace: 'express-coursier', titre: 'Me mettre disponible, accepter une course', page: 'express-coursier.html', qui: COURSIER_TUTO,
    monde(m) { coursierDuMonde(m, { disponible_express: false }); m.TABLES.express_courses.push({ id: 'c-dispo', client_id: CLIENT_EXPRESS, coursier_id: null, status: 'en_attente', adresse_recuperation: 'Adjamé — Marché', adresse_livraison: 'Cocody — Riviera 3', description_colis: 'Un carton', created_at: iso(0, 8), latitude_recuperation: 5.33, longitude_recuperation: -4.02, latitude_livraison: 5.36, longitude_livraison: -3.99, prix_total: 1216, commission_montant: 182, montant_coursier: 1034, distance_km: 4.8 }); },
    async jouer(p) {
      await dire(p, '« Je suis disponible » : les courses proches vous sont proposées', 'Avec la localisation, les plus proches d\'abord');
      await toucher(p, p.locator('label.switch'), 2500);
      await dire(p, 'Une course : le trajet, la distance, votre part, le colis', '« Accepter » — le premier qui accepte la prend');
      await toucher(p, p.locator('#disponibles-list .btn-accept-course').first(), 900);
      if (await p.locator('#clt-modal-ok').isVisible().catch(() => false)) await toucher(p, p.locator('#clt-modal-ok'), 1500);
      await dire(p, 'Elle est dans « Mes courses » ; le client est prévenu', 'Itinéraire, appeler, WhatsApp, discuter');
      await toucher(p, p.locator('#clt-bottomnav [data-target="section-mescourses"]'), 1800);
    } },
  { id: 'coursier-livrer-code', espace: 'express-coursier', titre: 'Récupérer, puis livrer avec le code', page: 'express-coursier.html', qui: COURSIER_TUTO,
    monde(m) { coursierDuMonde(m); m.TABLES.express_courses.push({ id: 'c-livr', client_id: CLIENT_EXPRESS, coursier_id: COURSIER_TUTO, status: 'acceptee', adresse_recuperation: 'Adjamé — Marché', adresse_livraison: 'Cocody — Riviera 3', description_colis: 'Un carton', destinataire_nom: 'Mme Koné', created_at: iso(0, 8), accepted_at: iso(0, 8), prix_total: 1216, commission_montant: 182, montant_coursier: 1034, distance_km: 4.8 }); m.TABLES.express_codes_livraison.push({ course_id: 'c-livr', code: '0472', created_at: iso(0, 8) }); },
    async jouer(p) {
      await toucher(p, p.locator('#clt-bottomnav [data-target="section-mescourses"]'), 1200);
      await dire(p, '1. Chez l\'expéditeur : « J\'ai récupéré le colis »', 'Le client voit « colis récupéré »');
      await toucher(p, p.locator('.btn-recup-course').first(), 800);
      await toucher(p, p.locator('#clt-modal-ok'), 1500);
      await dire(p, '2. À la remise : « Marquer livrée » demande le code', 'Les 4 chiffres que le client a donnés à la personne qui reçoit');
      await toucher(p, p.locator('.btn-deliver-course').first(), 900);
      await taper(p, p.locator('#preuve-feuille .preuve-saisie'), '0472');
      await toucher(p, p.locator('#preuve-feuille .preuve-valider'), 1800);
      await dire(p, 'Livrée, code vérifié : votre commission est débitée du solde', 'Sans le code : « livrer sans preuve », le client confirme');
    } },
  { id: 'coursier-recharger', espace: 'express-coursier', titre: 'Recharger mon solde', page: 'express-coursier.html', qui: COURSIER_TUTO,
    monde(m) { coursierDuMonde(m); m.TABLES.express_wallets = [{ coursier_id: COURSIER_TUTO, solde: 0 }]; m.TABLES.express_config[0].solde_minimum = 500; m.TABLES.express_config[0].momo_wave = '0700000000'; },
    async jouer(p) {
      await dire(p, 'Solde : la commission de chaque course est débitée ici', 'Sous le minimum, plus d\'acceptation');
      await toucher(p, p.locator('#clt-bottomnav [data-target="section-recharges"]'), 1500);
      await dire(p, '« Recharger mon solde » : l\'opérateur, le montant, la référence', 'Envoyez l\'argent sur le numéro de CLT, puis déclarez-le');
      await toucher(p, p.locator('#btn-open-recharge'), 1000);
      const op = p.locator('#momo-grid .momo-choice').first(); if (await op.count()) await toucher(p, op, 800);
      await taper(p, p.locator('#recharge-montant'), '2000');
      await taper(p, p.locator('#recharge-reference'), 'WV123456');
      await toucher(p, p.locator('#btn-submit-recharge'), 1800);
      await dire(p, 'Le bureau vérifie et valide : vous êtes notifié, le solde est crédité', '');
    } },
  { id: 'coursier-signaler', espace: 'express-coursier', titre: 'Signaler un problème sur une course', page: 'express-coursier.html', qui: COURSIER_TUTO,
    monde(m) { coursierDuMonde(m); m.TABLES.express_courses.push({ id: 'c-sig', client_id: CLIENT_EXPRESS, coursier_id: COURSIER_TUTO, status: 'livree', adresse_recuperation: 'Adjamé — Marché', adresse_livraison: 'Cocody — Riviera 3', description_colis: 'Un carton', created_at: iso(0, 8), accepted_at: iso(0, 8), recuperee_at: iso(0, 9), delivered_at: iso(0, 10), preuve_type: 'sans', prix_total: 1216, commission_montant: 182, montant_coursier: 1034, commission_reglee: true, distance_km: 4.8 }); },
    async jouer(p) {
      await toucher(p, p.locator('#clt-bottomnav [data-target="section-mescourses"]'), 1200);
      await p.evaluate(() => document.querySelectorAll('details.courses-terminees').forEach(d => { d.open = true; })); await dodo(800);
      await dire(p, 'Sous la course : « ⚠️ Signaler un problème »', 'Paiement incomplet, client injoignable, adresse introuvable…');
      await toucher(p, p.locator('[data-litige-signaler]').first(), 900);
      await toucher(p, p.locator('#litige-feuille .litige-motif[data-motif="paiement"]'), 700);
      await taper(p, p.locator('#litige-feuille .litige-texte'), 'Le client a payé 1 000 au lieu de 1 216');
      await toucher(p, p.locator('#litige-feuille .litige-envoyer'), 1800);
      await dire(p, 'CLT vous répond sous la course, dans les 24 h', '');
    } },
];

async function enregistrer(sc) {
  const monde = nouveauMonde();
  sc.monde(monde);
  const dossierBrut = path.join(BRUT, sc.id);
  fs.rmSync(dossierBrut, { recursive: true, force: true });
  /* La caméra tourne dès l'ouverture du navigateur : les premières images montraient la page
     technique par laquelle le parcours pose la session (manifest-login.json — « un code », Celtis,
     25/09). On note l'instant où l'écran de l'application est prêt et le sous-titre posé, et le
     montage commence LÀ. */
  const tCamera = Date.now();
  let coupe = 0;
  const N = await ouvrirNavigateur({ monde, contexte: { recordVideo: { dir: dossierBrut, size: { width: 390, height: 844 } } } });
  const { page } = N;
  let erreur = null;
  try {
    await N.ouvrirConnecte(sc.page, sc.qui);
    await dodo(1500);
    await armer(page, sc.titre);
    coupe = (Date.now() - tCamera) / 1000 + 0.3;
    await dodo(1200);
    await sc.jouer(page);
    await dodo(1500);
  } catch (e) { erreur = e; console.error('  ⚠️ ' + sc.id + ' : ' + (e.message || e).split('\n')[0]); }
  const video = page.video();
  await N.fermer();
  const webm = video ? await video.path() : null;
  if (!webm || !fs.existsSync(webm)) { console.error('  ❌ pas de vidéo pour ' + sc.id); return false; }
  // Un scénario interrompu (clic impossible, écran absent) ne produit pas de vidéo : on garderait une image
  // figée pendant une minute (cliente-releve, 25/09). L'ancienne vidéo reste en place.
  if (erreur) { console.error('  ❌ ' + sc.id + ' : scénario interrompu, vidéo non écrite — ' + (erreur.message || '').split('\n')[0].slice(0, 120)); return false; }
  const mp4 = path.join(SORTIE, sc.id + '.mp4');
  const jpg = path.join(SORTIE, sc.id + '.jpg');
  // 12 images/s, H.264 très compressé, faststart pour lire avant d'avoir tout reçu ; l'affiche à 3 s.
  let r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', coupe.toFixed(2), '-i', webm, '-vf', 'fps=12,scale=390:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '35', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
  if (r.status !== 0) { console.error('  ❌ ffmpeg : ' + r.stderr); return false; }
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1', '-i', mp4, '-frames:v', '1', '-q:v', '6', jpg]);
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
