/* DÉMO — Générale CI → CLT, une commande du début à la fin (25/09/2026). Outil jetable.
   Rejoue le parcours dans les VRAIES pages de l'application (monde factice des parcours), une
   séquence par écran, sous-titrée ; les deux étapes qui se passent chez Générale CI (envoi de la
   commande, relecture du statut) sont des cartes expliquées. ffmpeg assemble le tout en 1280×720. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ouvrirNavigateur, dodo } from './_navigateur.mjs';
import { nouveauMonde, iso, aujourdhui, ADMIN, LIVREUR } from './_monde.mjs';

const OUT = process.env.DEMO_SORTIE || '/tmp/demo';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

const GCI = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb0c1';
const PA = 'aaaa0000-0000-4000-8000-00000000c001';
const monde = nouveauMonde();
monde.PROFILS.push({ id: GCI, full_name: 'Générale CI', role: 'fournisseur', phone: '2250700000077', status: 'valide', company_name: 'Générale CI', commune_recuperation: 'Cocody', adresse_recuperation: 'Angré 8e tranche', avatar_url: null });
monde.TABLES.partenaires = [{ id: PA, cle: 'generale-ci', nom: 'Générale CI', fournisseur_id: null, cle_api_fin: null, cle_api_creee_le: null, tarif_meme_commune: 1000, prix_minimum: 1000, actif: true }];
monde.TABLES.partenaire_commandes = [];

const STYLE = `#clt-tuto{position:fixed;left:0;right:0;top:0;z-index:99999;background:rgba(27,67,116,.96);color:#fff;font:700 19px/1.3 Inter,system-ui,sans-serif;padding:14px 22px;box-shadow:0 6px 20px rgba(0,0,0,.25)}
#clt-tuto small{display:block;font-weight:500;font-size:14px;opacity:.88;margin-top:3px}
#clt-tuto b.n{display:inline-block;background:#E26313;border-radius:999px;padding:0 10px;margin-right:8px}
#clt-tuto-ring{position:fixed;z-index:99998;border:4px solid #E26313;border-radius:14px;box-shadow:0 0 0 6px rgba(226,99,19,.25);pointer-events:none;transition:all .25s;display:none}`;
async function armer(page) {
  await page.addStyleTag({ content: STYLE });
  await page.evaluate(() => { if (!document.getElementById('clt-tuto')) { const d = document.createElement('div'); d.id = 'clt-tuto'; document.body.appendChild(d); const r = document.createElement('div'); r.id = 'clt-tuto-ring'; document.body.appendChild(r); } });
}
async function dire(page, t, s, ms) { await page.evaluate(([t, s]) => { const d = document.getElementById('clt-tuto'); if (d) d.innerHTML = t + (s ? '<small>' + s + '</small>' : ''); }, [t, s || '']); await dodo(ms || 2600); }
async function montrer(page, loc, ms) {
  const el = loc.first(); await el.scrollIntoViewIfNeeded().catch(() => {}); await dodo(300);
  const b = await el.boundingBox();
  if (b) await page.evaluate(([x, y, w, h]) => { const r = document.getElementById('clt-tuto-ring'); r.style.display = 'block'; r.style.left = (x - 8) + 'px'; r.style.top = (y - 8) + 'px'; r.style.width = (w + 16) + 'px'; r.style.height = (h + 16) + 'px'; }, [b.x, b.y, b.width, b.height]);
  await dodo(ms || 1400);
}
async function cacher(page) { await page.evaluate(() => { const r = document.getElementById('clt-tuto-ring'); if (r) r.style.display = 'none'; }); }
async function toucher(page, loc, ms) {
  await montrer(page, loc, 1000);
  try { await loc.first().click({ timeout: 5000 }); } catch (e) { await loc.first().evaluate((n) => n.click()); }
  await cacher(page); await dodo(ms || 1200);
}

const segments = [];
async function sequence(nom, taille, fn) {
  const dir = path.join(OUT, 'brut-' + nom);
  const t0 = Date.now(); let coupe = 0;
  const N = await ouvrirNavigateur({ monde, contexte: { viewport: taille, recordVideo: { dir, size: taille } } });
  try { coupe = await fn(N.page, N, () => (Date.now() - t0) / 1000 + 0.2); }
  catch (e) { console.error('⚠️ ' + nom + ' : ' + e.message.split('\n')[0]); }
  const v = N.page.video(); await N.fermer();
  const webm = await v.path();
  const mp4 = path.join(OUT, nom + '.mp4');
  const tel = taille.width < 600;
  const vf = tel
    ? 'fps=25,scale=-2:720:flags=lanczos,pad=1280:720:(ow-iw)/2:0:color=0x0F2A47'
    : 'fps=25,scale=1280:720:flags=lanczos';
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(coupe || 0), '-i', webm, '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-an', mp4]);
  if (r.status) console.error(r.stderr.toString());
  segments.push(mp4); console.log('🎬 ' + nom);
}

/* Les cartes (introduction, ce qui se passe chez Générale CI, fin). */
const CARTE = (html) => `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:1280px;height:720px;font-family:Inter,system-ui,sans-serif;background:#0F2A47;color:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden}
.box{width:1120px}.k{color:#F5A15B;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:16px}
h1{font-size:46px;margin:10px 0 16px;line-height:1.1}p{font-size:22px;line-height:1.45;color:#D6E2F0;margin:0 0 14px}
.et{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:22px}.et div{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:16px 18px;font-size:18px;opacity:0;animation:v .5s forwards}
.et b{display:block;color:#F5A15B;font-size:15px;margin-bottom:4px}
@keyframes v{to{opacity:1}}
.cols{display:grid;grid-template-columns:330px 70px 1fr;gap:18px;align-items:center;margin-top:18px}
.tel{background:#FAFAF7;color:#111;border-radius:34px;padding:22px 18px;height:430px;box-shadow:0 20px 50px rgba(0,0,0,.4);font-size:15px}
.tel .jaune{background:#FFD21F;border-radius:18px;padding:14px;margin:10px 0;font-weight:700}
.tel .l{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:8px 0}
.fl{font-size:54px;color:#F5A15B;text-align:center;animation:p 1s infinite alternate}@keyframes p{from{opacity:.4}to{opacity:1}}
pre{background:#0A1C30;border:1px solid #2B4A6E;border-radius:14px;padding:16px 18px;font:15px/1.5 "DejaVu Sans Mono",monospace;color:#CFE3FF;margin:0 0 12px;white-space:pre-wrap}
.ok{color:#7BE3A8}.cle{color:#F5A15B}
</style></head><body><div class="box">${html}</div></body></html>`;
async function carte(nom, html, ms) {
  await sequence(nom, { width: 1280, height: 720 }, async (page, N, maintenant) => {
    await page.setContent(CARTE(html)); await dodo(400); const c = maintenant(); await dodo(ms); return c;
  });
}

/* 0. Introduction */
await carte('00-intro', `<div class="k">Démonstration · données d'essai</div><h1>Une commande Générale CI,<br>du téléphone du client à la livraison</h1>
<p>Voici le parcours complet, dans la vraie application CLT.</p>
<div class="et">${['Brancher Générale CI (une fois)', 'Le client commande sur Générale CI', 'La commande arrive chez CLT', 'Le bureau la confie à un livreur', 'Le livreur récupère et livre', 'Générale CI voit « livré »'].map((t, i) => `<div style="animation-delay:${0.4 + i * 0.35}s"><b>Étape ${i + 1}</b>${t}</div>`).join('')}</div>`, 7000);

/* 1. Gestion : relier le compte, créer la clé */
await sequence('01-brancher', { width: 1280, height: 720 }, async (page, N, maintenant) => {
  await N.ouvrirConnecte('gestion.html', ADMIN); await dodo(2200);
  await page.evaluate(() => { switchTab('compta'); switchSub('compta', 'partenaires'); }); await dodo(1200);
  await armer(page); const c = maintenant();
  await dire(page, '<b class="n">1</b>Brancher Générale CI — une seule fois', 'Gestion › Comptabilité › Partenaires');
  await montrer(page, page.locator('.pa-part'), 1600);
  await dire(page, '<b class="n">1</b>On relie leur compte client CLT', 'Leurs colis vivront là, à part de vos clientes');
  await montrer(page, page.locator('[data-pa-compte]'), 900);
  await page.locator('[data-pa-compte]').selectOption(GCI); await dodo(1500);
  await dire(page, '<b class="n">1</b>« Créer la clé » : elle est montrée une seule fois', 'Vous la copiez et l\'envoyez en privé à leur développeur');
  await toucher(page, page.locator('[data-pa-cle]'), 3200);
  await page.locator('#pa-cle-fenetre [data-clt-fermer]').click(); await dodo(900);
  await dire(page, '<b class="n">1</b>Branché ✓', 'Leur application peut maintenant envoyer ses commandes', 2800);
  return c;
});

/* 2. Chez Générale CI : la commande part */
await carte('02-commande', `<div class="k">Étape 2 · chez Générale CI</div><h1>Awa commande deux paires de chaussures</h1>
<div class="cols"><div class="tel"><b style="font-size:20px">Générale CI</b><div class="jaune">Commande GCI-1026-0012 confirmée ✓</div>
<div class="l"><span>2 paires de chaussures</span><b>25 000 F</b></div><div class="l"><span>Boutique Élégance</span><span>Cocody</span></div><div class="l"><span>Livraison</span><span>Riviera 2</span></div><div class="l"><span>Paiement</span><span>à la livraison</span></div></div>
<div class="fl">➜</div>
<div><p>Leur application envoie aussitôt la commande à CLT, avec sa clé :</p>
<pre>{ "reference": "GCI-1026-0012",
  "montant_a_encaisser": 25000,
  "destinataire": { "nom": "Awa K.", "commune": "Cocody",
                    "adresse": "Riviera 2, près de la pharmacie" },
  "boutique": { "nom": "Boutique Élégance", "commune": "Cocody" } }</pre>
<p>CLT répond en une fraction de seconde :</p>
<pre class="ok">{ "ok": true, "numero": "CLT-261026-02240",
  "prix_livraison": 1000, "statut": "en_attente" }</pre></div></div>`, 11000);

/* Ce que fait la base à cet instant (partenaire_recevoir_commande) : le colis naît sous leur compte. */
const ID = 'cccccccc-cccc-4ccc-8ccc-0000000c1026';
monde.TABLES.colis.push({ id: ID, numero: 'CLT-261026-02240', fournisseur_id: GCI, livreur_id: null, livreur_collecte_id: null,
  description: '2 paires de chaussures', destination: 'Awa K. — Riviera 2, près de la pharmacie', commune_destination: 'Cocody',
  destinataire_telephone: '2250701020304', montant_article: 25000, montant_livraison: 1000, montant: 26000, livraison_payee: true,
  statut: 'en_attente', created_at: iso(0, 8), updated_at: iso(0, 8), commune_recuperation: 'Cocody', adresse_recuperation: 'Boutique Élégance — Angré 8e tranche — 0505050505',
  cree_par: GCI, cree_par_role: 'fournisseur', partenaire_id: PA, reference_partenaire: 'GCI-1026-0012', note_interne: 'Générale CI · commande GCI-1026-0012 · boutique Boutique Élégance',
  recupere_at: null, livre_at: null, non_livre_at: null, retour_at: null, en_livraison_at: null, article_non_encaisse: false, livraison_non_encaissee: false, encaissement_remis: false,
  reverse_au_fournisseur_at: null, photo_livraison_url: null, observation: null, motif_non_livraison: null, vendeuse_prevenue: false, reporte_au: null, a_livrer_avant: null, frais_expedition: null, frais_soldes_at: null, livraison_payee_non_livre: false, depart_collecte_at: null });
monde.TABLES.partenaire_commandes.push({ id: 'pc-demo', partenaire_id: PA, reference: 'GCI-1026-0012', boutique: 'Boutique Élégance', colis_id: ID, recu_le: new Date().toISOString() });

/* 3. Le bureau : la commande est là, marquée ; on la confie */
await sequence('03-bureau', { width: 1280, height: 720 }, async (page, N, maintenant) => {
  await N.ouvrirConnecte('equipe.html', ADMIN); await dodo(2200);
  await page.evaluate(() => showEquipeTab('colis')); await dodo(1500);
  await armer(page); const c = maintenant();
  const bloc = page.locator('#a-confier [data-confier-cliente="' + GCI + '"]');
  await dire(page, '<b class="n">3</b>La commande est arrivée seule chez CLT', 'Rangée sur le compte « Générale CI », à part de vos clientes');
  await montrer(page, bloc, 2600);
  await dire(page, '<b class="n">4</b>Le bureau la confie à un livreur', 'Bloc « À confier » : on choisit Koffi, puis « Confier »');
  await montrer(page, bloc, 1500);
  await bloc.locator('[data-confier-livreur]').selectOption(LIVREUR); await bloc.locator('[data-confier-livreur]').dispatchEvent('change'); await dodo(900);
  await toucher(page, bloc.locator('[data-confier-ok]'), 2400);
  await dire(page, '<b class="n">4</b>Confié à Koffi ✓', 'Il le voit dans sa tournée : récupération à la Boutique Élégance', 2600);
  return c;
});

/* 4. Le livreur : récupère, part livrer, livre */
await sequence('04-livreur', { width: 390, height: 844 }, async (page, N, maintenant) => {
  // Récupéré à la boutique (le geste « Récupéré » est montré dans les tutoriels) : on reprend au départ en livraison.
  const cl = monde.TABLES.colis.find((x) => x.id === ID);
  Object.assign(cl, { livreur_id: LIVREUR, statut: 'recupere', recupere_at: iso(0, 9) });
  await N.ouvrirConnecte('livreur.html', LIVREUR); await dodo(2200);
  await armer(page); const c = maintenant();
  await page.locator('#clt-bottomnav [data-nav="mes"]').click().catch(() => {}); await dodo(1200);
  const carte = page.locator('.colis-item', { has: page.locator('.colis-partenaire') });
  await dire(page, '<b class="n">5</b>Koffi a récupéré le colis à la boutique', 'La carte dit « Partenaire » : c\'est Générale CI');
  await montrer(page, carte, 1800);
  await dire(page, '<b class="n">5</b>« Je pars livrer »', 'Le statut change chez CLT… et chez Générale CI');
  await toucher(page, carte.locator('[data-etape="en_livraison"]'), 1600);
  for (let i = 0; i < 2; i++) { const pt = page.locator('button:has-text("Plus tard")'); if (await pt.first().isVisible().catch(() => false)) { await toucher(page, pt, 900); } }
  await dire(page, '<b class="n">5</b>Chez Awa : « Livré »', 'Il encaisse 25 000 F ; la livraison est facturée à Générale CI');
  await toucher(page, carte.locator('[data-etape="livre"]'), 1500);
  if (await page.locator('#clt-modal-ok').isVisible().catch(() => false)) await toucher(page, page.locator('#clt-modal-ok'), 1500);
  for (let i = 0; i < 2; i++) { const pt = page.locator('button:has-text("Plus tard")'); if (await pt.first().isVisible().catch(() => false)) { await toucher(page, pt, 900); } }
  await dire(page, '<b class="n">5</b>Livré ✓', '', 2200);
  return c;
});

/* 5. Chez Générale CI : le statut revient */
await carte('05-statut', `<div class="k">Étape 6 · chez Générale CI</div><h1>Leur application voit « livré »</h1>
<div class="cols"><div class="tel"><b style="font-size:20px">Générale CI</b><div class="jaune" style="background:#C9F2D9">Votre commande est livrée ✓</div>
<div class="l"><span>GCI-1026-0012</span><b>Livrée</b></div><div class="l"><span>Livrée à</span><span>11 h 42</span></div><div class="l"><span>Livreur</span><span>CLT</span></div></div>
<div class="fl">⟵</div>
<div><p>Toutes les quelques minutes, leur application relit les statuts chez CLT :</p>
<pre>{ "reference": "GCI-1026-0012", "numero": "CLT-261026-02240",
  "statut": "<span class="ok">livre</span>", "livre_le": "2026-10-26T11:42:00Z",
  "montant_a_encaisser": 25000, "prix_livraison": 1000 }</pre>
<p>Le lendemain, CLT reverse les 25 000 F par Wave ; le relevé de la semaine retient la livraison.</p></div></div>`, 10000);

/* 6. Fin */
await carte('06-fin', `<div class="k">En résumé</div><h1>Aucune ressaisie. Rien ne se mélange.</h1>
<p>✓ La commande arrive seule, sur le compte Générale CI, au tarif convenu.</p>
<p>✓ Le bureau la confie ; le livreur la reconnaît au badge « 🤝 Partenaire ».</p>
<p>✓ Chaque étape remonte chez Générale CI ; l'argent suit le circuit habituel.</p>
<p style="margin-top:26px;color:#F5A15B;font-weight:700">Prochaine étape : créer leur compte, la clé, et 2 ou 3 commandes d'essai avant le 26 octobre.</p>`, 8000);

/* Le montage. */
const liste = path.join(OUT, 'liste.txt');
fs.writeFileSync(liste, segments.map((s) => "file '" + s + "'").join('\n'));
const fin = path.join(OUT, 'Demo - Generale CI vers CLT.mp4');
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', liste, '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', fin]);
if (r.status) console.error(r.stderr.toString());
console.log('✅ ' + fin);
process.exit(0);
