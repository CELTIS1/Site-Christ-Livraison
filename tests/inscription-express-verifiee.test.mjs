/* INSCRIPTION EXPRESS VÉRIFIÉE — 10 septembre 2026 (feuille de route 1.8)
   ==========================================================================================
   Ce banc charge les VRAIES fonctions serveur (supabase-functions/…/index.ts), leur donne un faux
   Deno et un faux client Supabase, et rejoue des appels :
     • inscrire-client-express / inscrire-coursier-express : numéro invalide refusé ; numéro
       normalisé (« 07 05 40 46 55 » → 2250705404655) ; 4e inscription du même numéro dans la
       journée → 429 ; 21e de la même adresse dans l'heure → 429 ; le compte naît « en_attente » ;
       une pièce « .exe renommée .jpg » (mauvais octets) → refusée ; JPEG, PNG, PDF acceptés ;
       plus de 8 Mo → refusée.
     • envoyer-code-express : équipe active seulement ; code à 6 chiffres, haché ; jamais pour un
       numéro déjà vérifié.
     • verifier-code-express : bon code → client « valide », coursier reste « en_attente » mais
       numéro vérifié ; mauvais code ×5 → annulé ; expiré → 410.
     • creer-livreur : un compte suspendu, ou une équipe sans accès Opérations, est refusé.
   Le SQL, quand il est sur le poste, est relu : colonne, deux tables, aucun droit anon.

   Lancer à la main :  node tests/inscription-express-verifiee.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createHash, webcrypto } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONCTIONS = path.join(RACINE, 'supabase-functions');
const CHEMIN_SQL = path.join(RACINE, '_sql-prive', '2026-09-10-inscription-express-verifiee.sql');

let reussies = 0, echouees = 0;
function verifier(t, condition, detail){
  if (condition) { reussies++; console.log('  ✅ ' + t); }
  else { echouees++; console.log('  ❌ ' + t + (detail ? '\n       → ' + detail : '')); }
}
function titre(t){ console.log('\n' + t); }

/* ---------- Une petite base en mémoire, avec ce que les fonctions demandent ---------- */
function faireBase(){
  const tables = { profiles: [], express_codes_telephone: [], express_inscriptions_tentatives: [], activity_log: [] };
  const journal = [];
  let compteur = 0;
  function constructeur(table){
    const etat = { table, op: 'select', filtres: [], valeurs: null, count: false, head: false, mode: 'liste' };
    const applique = () => {
      let lignes = (tables[table] || []).slice();
      for (const f of etat.filtres) {
        if (f.type === 'eq') lignes = lignes.filter(l => l[f.colonne] === f.valeur);
        if (f.type === 'in') lignes = lignes.filter(l => f.valeurs.includes(l[f.colonne]));
        if (f.type === 'gte') lignes = lignes.filter(l => String(l[f.colonne]) >= String(f.valeur));
      }
      return lignes;
    };
    const finir = () => {
      journal.push({ table, op: etat.op, filtres: etat.filtres.slice(), valeurs: etat.valeurs });
      if (etat.op === 'select') {
        const lignes = applique();
        if (etat.count) return { data: null, error: null, count: lignes.length };
        if (etat.mode === 'single') return lignes.length === 1 ? { data: lignes[0], error: null } : { data: null, error: { message: 'pas une ligne' } };
        if (etat.mode === 'maybeSingle') return { data: lignes[0] || null, error: null };
        return { data: lignes, error: null };
      }
      if (etat.op === 'insert') { const v = Object.assign({ id: 'l' + (++compteur) }, etat.valeurs); tables[table].push(v); return { data: v, error: null }; }
      if (etat.op === 'upsert') {
        const cle = etat.cle || 'id';
        const idx = tables[table].findIndex(l => l[cle] === etat.valeurs[cle]);
        if (idx === -1) tables[table].push(Object.assign({}, etat.valeurs)); else Object.assign(tables[table][idx], etat.valeurs);
        return { data: null, error: null };
      }
      if (etat.op === 'update') { applique().forEach(l => Object.assign(l, etat.valeurs)); return { data: null, error: null }; }
      if (etat.op === 'delete') { const sup = applique(); tables[table] = tables[table].filter(l => !sup.includes(l)); return { data: null, error: null }; }
      return { data: null, error: null };
    };
    const b = {
      select(c, o){ etat.op = 'select'; if (o && o.count) etat.count = true; if (o && o.head) etat.head = true; return b; },
      insert(v){ etat.op = 'insert'; etat.valeurs = v; return b; },
      upsert(v, o){ etat.op = 'upsert'; etat.valeurs = v; etat.cle = o && o.onConflict; return b; },
      update(v){ etat.op = 'update'; etat.valeurs = v; return b; },
      delete(){ etat.op = 'delete'; return b; },
      eq(c, v){ etat.filtres.push({ type: 'eq', colonne: c, valeur: v }); return b; },
      in(c, v){ etat.filtres.push({ type: 'in', colonne: c, valeurs: v.slice() }); return b; },
      gte(c, v){ etat.filtres.push({ type: 'gte', colonne: c, valeur: v }); return b; },
      single(){ etat.mode = 'single'; return b; },
      maybeSingle(){ etat.mode = 'maybeSingle'; return b; },
      then(res, rej){ return Promise.resolve().then(finir).then(res, rej); },
    };
    return b;
  }
  const auth = {
    // Les jetons de banc sont « jeton:<id utilisateur> ».
    getUser: async (token) => { const id = String(token).startsWith('jeton:') ? token.slice(6) : null; return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: 'invalide' } }; },
    admin: {
      createUser: async ({ phone }) => {
        if (tables.profiles.some(p => p.phone === phone)) return { data: null, error: { message: 'User already registered' } };
        const id = 'u' + (++compteur);
        // Le déclencheur handle_new_user() insère une fiche par défaut.
        tables.profiles.push({ id, phone, role: 'fournisseur', status: 'valide' });
        return { data: { user: { id } }, error: null };
      },
      deleteUser: async (id) => { tables.profiles = tables.profiles.filter(p => p.id !== id); return { error: null }; },
    },
  };
  const fichiers = [];
  const storage = { from: () => ({ upload: async (p, bytes, o) => { fichiers.push({ p, taille: bytes.length, type: o.contentType }); return { error: null }; }, remove: async () => ({ error: null }) }) };
  return { client: { from: constructeur, auth, storage }, tables, journal, fichiers };
}

function chargerFonction(nom, base){
  const source = fs.readFileSync(path.join(FONCTIONS, nom, 'index.ts'), 'utf8');
  const sansImports = source.replace(/^\s*import\s.*$/gm, '');
  const enJS = stripTypeScriptTypes(sansImports, { mode: 'strip' });
  let gestionnaire = null;
  const contexte = vm.createContext({
    console: { log(){}, warn(){}, error(){} },
    JSON, Object, String, Number, Boolean, Date, Math, Promise, RegExp, Set, Map, Error, Array, Uint8Array, Uint32Array,
    TextEncoder, encodeURIComponent, atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    crypto: webcrypto,
    Response: class { constructor(corps, init){ this.corps = corps; this.init = init || {}; this.status = this.init.status || 200; } },
    Deno: { env: { get: (cle) => ({ SUPABASE_URL: 'https://exemple.test', SUPABASE_SERVICE_ROLE_KEY: 'service' })[cle] }, serve: (fn) => { gestionnaire = fn; } },
    createClient: () => base.client,
  });
  vm.runInContext(enJS, contexte);
  if (!gestionnaire) { console.error('Deno.serve introuvable dans ' + nom); process.exit(1); }
  return gestionnaire;
}

async function appeler(gestionnaire, corps, entetes){
  const e = Object.assign({}, entetes || {});
  const req = { method: 'POST', headers: { get: (n) => e[n.toLowerCase()] ?? null }, json: async () => corps };
  const rep = await gestionnaire(req);
  let json = null; try { json = JSON.parse(rep.corps); } catch {}
  return { status: rep.status, json };
}

const sha = (s) => createHash('sha256').update(s).digest('hex');
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const JPEG = b64(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]));
const PNG = b64(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]));
const PDF = b64(Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 1)]));
const EXE = b64(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]));

/* ---------- 1. Le client Express ---------- */
titre('inscrire-client-express : le numéro, le débit, le compte en attente');
{
  const base = faireBase();
  const f = chargerFonction('inscrire-client-express', base);
  const r0 = await appeler(f, { full_name: 'Awa Koné', phone: '12345', password: 'secret1' }, {});
  verifier('un numéro fantaisiste est refusé (400), rien n\'est créé', r0.status === 400 && base.tables.profiles.length === 0, JSON.stringify(r0.json));
  const r1 = await appeler(f, { full_name: 'Awa Koné', phone: '07 05 40 46 55', password: 'secret1' }, { 'x-forwarded-for': '1.2.3.4' });
  const awa = base.tables.profiles.find(p => p.phone === '2250705404655');
  verifier('« 07 05 40 46 55 » est normalisé en 2250705404655 et le compte est créé', r1.status === 200 && !!awa, JSON.stringify(r1.json));
  verifier('le compte naît EN ATTENTE, rôle client_express, numéro non vérifié, et la réponse dit a_verifier', awa && awa.status === 'en_attente' && awa.role === 'client_express' && awa.telephone_verifie_at === null && r1.json.a_verifier === true);
  verifier('la tentative est notée (numéro, adresse, rôle)', base.tables.express_inscriptions_tentatives.length === 1 && base.tables.express_inscriptions_tentatives[0].ip === '1.2.3.4');
  await appeler(f, { full_name: 'Awa Koné', phone: '0705404655', password: 'secret1' }, { 'x-forwarded-for': '1.2.3.4' });
  await appeler(f, { full_name: 'Awa Koné', phone: '2250705404655', password: 'secret1' }, { 'x-forwarded-for': '1.2.3.4' });
  const r4 = await appeler(f, { full_name: 'Awa Koné', phone: '+225 07 05 40 46 55', password: 'secret1' }, { 'x-forwarded-for': '1.2.3.4' });
  verifier('4e inscription du même numéro dans la journée → 429, et rien n\'est écrit', r4.status === 429 && base.tables.express_inscriptions_tentatives.length === 3, 'reçu ' + r4.status);
  const base2 = faireBase();
  const f2 = chargerFonction('inscrire-client-express', base2);
  for (let i = 0; i < 20; i++) base2.tables.express_inscriptions_tentatives.push({ phone: '22507000000' + String(i).padStart(2, '0'), ip: '9.9.9.9', cree_at: new Date().toISOString() });
  const r21 = await appeler(f2, { full_name: 'Robot', phone: '0700000099', password: 'secret1' }, { 'x-forwarded-for': '9.9.9.9' });
  verifier('21e inscription de la même adresse dans l\'heure → 429', r21.status === 429, 'reçu ' + r21.status);
  const rAutre = await appeler(f2, { full_name: 'Vraie cliente', phone: '0700000098', password: 'secret1' }, { 'x-forwarded-for': '8.8.8.8' });
  verifier('une autre adresse passe', rAutre.status === 200);
}

/* ---------- 2. Le coursier Express et sa pièce ---------- */
titre('inscrire-coursier-express : la pièce est jugée sur ses octets');
{
  const base = faireBase();
  const f = chargerFonction('inscrire-coursier-express', base);
  const corps = (piece) => ({ full_name: 'Koffi Yao', phone: '0102030405', password: 'secret1', piece_identite_base64: piece, piece_identite_mime: 'image/jpeg' });
  const rExe = await appeler(f, corps(EXE), {});
  verifier('un .exe renommé .jpg (type annoncé image/jpeg, octets MZ) est refusé, et AUCUN compte ni tentative n\'est créé',
    rExe.status === 400 && /JPEG ou PNG|PDF/.test(rExe.json.error) && base.tables.profiles.length === 0 && base.tables.express_inscriptions_tentatives.length === 0, JSON.stringify(rExe.json));
  const rJpeg = await appeler(f, corps(JPEG), {});
  const koffi = base.tables.profiles.find(p => p.phone === '2250102030405');
  verifier('un vrai JPEG passe : compte coursier en attente, pièce rangée en .jpg', rJpeg.status === 200 && koffi && koffi.status === 'en_attente' && koffi.role === 'coursier_express' && koffi.piece_identite_path === `${koffi.id}/piece-identite.jpg` && base.fichiers[0].type === 'image/jpeg', JSON.stringify(rJpeg.json));
  const rPng = await appeler(f, Object.assign(corps(PNG), { phone: '0102030406' }), {});
  const rPdf = await appeler(f, Object.assign(corps(PDF), { phone: '0102030407', piece_identite_mime: 'application/octet-stream' }), {});
  verifier('un PNG et un PDF passent aussi, chacun sous sa vraie extension (le type annoncé ne compte pas)',
    rPng.status === 200 && rPdf.status === 200 && base.fichiers[1].p.endsWith('.png') && base.fichiers[2].p.endsWith('.pdf') && base.fichiers[2].type === 'application/pdf');
  const gros = 'A'.repeat(Math.ceil(8 * 1024 * 1024 * 4 / 3) + 100);
  const rGros = await appeler(f, Object.assign(corps(gros), { phone: '0102030408' }), {});
  verifier('plus de 8 Mo → refusé avant même de décoder', rGros.status === 400 && /8 Mo/.test(rGros.json.error));
  const rSans = await appeler(f, Object.assign(corps(JPEG), { phone: '0102030408', piece_identite_base64: '' }), {});
  verifier('sans pièce → refusé', rSans.status === 400);
  const rNum = await appeler(f, Object.assign(corps(JPEG), { phone: '99' }), {});
  verifier('numéro invalide → refusé', rNum.status === 400);
}

/* ---------- 3. Le code de l'équipe ---------- */
titre('envoyer-code-express : l\'équipe active seulement, un code à 6 chiffres haché');
const base = faireBase();
base.tables.profiles.push(
  { id: '00000000-0000-4000-8000-0000000000e1', role: 'equipe', status: 'valide', full_name: 'Bureau' },
  { id: '00000000-0000-4000-8000-0000000000e2', role: 'equipe', status: 'suspendu', full_name: 'Suspendu' },
  { id: '00000000-0000-4000-8000-000000000011', role: 'livreur', status: 'valide', full_name: 'Koffi' },
  { id: '00000000-0000-4000-8000-0000000000c1', role: 'client_express', status: 'en_attente', full_name: 'Awa Koné', phone: '2250705404655', telephone_verifie_at: null },
  { id: '00000000-0000-4000-8000-0000000000d1', role: 'coursier_express', status: 'en_attente', full_name: 'Yao', phone: '2250102030405', telephone_verifie_at: null },
  { id: '00000000-0000-4000-8000-0000000000c9', role: 'client_express', status: 'valide', full_name: 'Déjà', phone: '2250700000001', telephone_verifie_at: '2026-09-01T00:00:00Z' },
);
const envoyer = chargerFonction('envoyer-code-express', base);
const verifierCode = chargerFonction('verifier-code-express', base);
let codeAwa = null;
{
  const r0 = await appeler(envoyer, { user_id: '00000000-0000-4000-8000-0000000000c1' }, {});
  verifier('sans jeton → 401', r0.status === 401);
  const r1 = await appeler(envoyer, { user_id: '00000000-0000-4000-8000-0000000000c1' }, { authorization: 'Bearer jeton:00000000-0000-4000-8000-000000000011' });
  verifier('un livreur → 403', r1.status === 403);
  const r2 = await appeler(envoyer, { user_id: '00000000-0000-4000-8000-0000000000c1' }, { authorization: 'Bearer jeton:00000000-0000-4000-8000-0000000000e2' });
  verifier('une équipe SUSPENDUE → 403', r2.status === 403);
  const r3 = await appeler(envoyer, { user_id: '00000000-0000-4000-8000-0000000000c9' }, { authorization: 'Bearer jeton:00000000-0000-4000-8000-0000000000e1' });
  verifier('un numéro déjà vérifié ne reçoit pas de code (409)', r3.status === 409 && r3.json.state === 'deja_verifie');
  const r4 = await appeler(envoyer, { user_id: '00000000-0000-4000-8000-0000000000c1' }, { authorization: 'Bearer jeton:00000000-0000-4000-8000-0000000000e1' });
  codeAwa = r4.json && r4.json.code;
  const ligne = base.tables.express_codes_telephone.find(l => l.user_id === '00000000-0000-4000-8000-0000000000c1');
  verifier('l\'équipe reçoit un code à 6 chiffres, le numéro et le nom', r4.status === 200 && /^[0-9]{6}$/.test(codeAwa || '') && r4.json.phone === '2250705404655' && r4.json.full_name === 'Awa Koné', JSON.stringify(r4.json));
  verifier('en base : seulement l\'empreinte SHA-256 de « <user_id>:<code> », 30 min, 0 essai', ligne && ligne.code_hash === sha('00000000-0000-4000-8000-0000000000c1:' + codeAwa) && ligne.tentatives === 0 && (new Date(ligne.expire_at) - Date.now()) > 29 * 60000 && !JSON.stringify(ligne).includes(codeAwa));
  const r5 = await appeler(envoyer, { user_id: '00000000-0000-4000-8000-0000000000c1' }, { authorization: 'Bearer jeton:00000000-0000-4000-8000-0000000000e1' });
  verifier('un nouveau code remplace l\'ancien (une seule ligne par compte)', r5.status === 200 && base.tables.express_codes_telephone.filter(l => l.user_id === '00000000-0000-4000-8000-0000000000c1').length === 1 && base.tables.express_codes_telephone[0].code_hash === sha('00000000-0000-4000-8000-0000000000c1:' + r5.json.code));
  codeAwa = r5.json.code;
  verifier('le journal d\'activité note l\'envoi', base.tables.activity_log.some(a => a.action === 'envoi_code_express' && a.target_id === '00000000-0000-4000-8000-0000000000c1'));
}

titre('verifier-code-express : le bon code ouvre le client, marque le coursier ; 5 faux annulent');
{
  const rNone = await appeler(verifierCode, { phone: '0700000009', code: '123456' }, {});
  verifier('un numéro inconnu : « aucun code en attente » (404, state none) — même réponse qu\'un code absent', rNone.status === 404 && rNone.json.state === 'none');
  const rMauvais = await appeler(verifierCode, { phone: '07 05 40 46 55', code: String((Number(codeAwa) + 1) % 1000000).padStart(6, '0') }, {});
  verifier('un code faux : 403, il reste 4 essais', rMauvais.status === 403 && rMauvais.json.state === 'code_faux' && rMauvais.json.restants === 4, JSON.stringify(rMauvais.json));
  const rBon = await appeler(verifierCode, { phone: '+2250705404655', code: codeAwa }, {});
  const awa = base.tables.profiles.find(p => p.id === '00000000-0000-4000-8000-0000000000c1');
  verifier('le bon code : le CLIENT passe à « valide », numéro vérifié, le code est effacé',
    rBon.status === 200 && rBon.json.success && awa.status === 'valide' && !!awa.telephone_verifie_at && !base.tables.express_codes_telephone.some(l => l.user_id === '00000000-0000-4000-8000-0000000000c1'), JSON.stringify(rBon.json));
  const rRe = await appeler(verifierCode, { phone: '0705404655', code: codeAwa }, {});
  verifier('rejouer le même code après coup ne casse rien (déjà vérifié)', rRe.status === 200 && rRe.json.state === 'deja_verifie');
  const rc = await appeler(envoyer, { user_id: '00000000-0000-4000-8000-0000000000d1' }, { authorization: 'Bearer jeton:00000000-0000-4000-8000-0000000000e1' });
  const rcBon = await appeler(verifierCode, { phone: '0102030405', code: rc.json.code }, {});
  const yao = base.tables.profiles.find(p => p.id === '00000000-0000-4000-8000-0000000000d1');
  verifier('le COURSIER : numéro vérifié, mais il reste « en_attente » (sa pièce doit être validée)', rcBon.status === 200 && !!yao.telephone_verifie_at && yao.status === 'en_attente', JSON.stringify(rcBon.json));
  base.tables.profiles.push({ id: '00000000-0000-4000-8000-0000000000c2', role: 'client_express', status: 'en_attente', full_name: 'Bintou', phone: '2250700000002', telephone_verifie_at: null });
  const r2 = await appeler(envoyer, { user_id: '00000000-0000-4000-8000-0000000000c2' }, { authorization: 'Bearer jeton:00000000-0000-4000-8000-0000000000e1' });
  const faux = String((Number(r2.json.code) + 7) % 1000000).padStart(6, '0');
  let dernier = null;
  for (let i = 0; i < 5; i++) dernier = await appeler(verifierCode, { phone: '0700000002', code: faux }, {});
  verifier('au 5e code faux : annulé (403, state annule), le code est effacé, le compte reste en attente',
    dernier.status === 403 && dernier.json.state === 'annule' && !base.tables.express_codes_telephone.some(l => l.user_id === '00000000-0000-4000-8000-0000000000c2') && base.tables.profiles.find(p => p.id === '00000000-0000-4000-8000-0000000000c2').status === 'en_attente', JSON.stringify(dernier.json));
  const rBonTrop = await appeler(verifierCode, { phone: '0700000002', code: r2.json.code }, {});
  verifier('même le bon code ne passe plus : il faut en demander un nouveau', rBonTrop.status === 404 && rBonTrop.json.state === 'none');
  const r3 = await appeler(envoyer, { user_id: '00000000-0000-4000-8000-0000000000c2' }, { authorization: 'Bearer jeton:00000000-0000-4000-8000-0000000000e1' });
  base.tables.express_codes_telephone.find(l => l.user_id === '00000000-0000-4000-8000-0000000000c2').expire_at = new Date(Date.now() - 1000).toISOString();
  const rExp = await appeler(verifierCode, { phone: '0700000002', code: r3.json.code }, {});
  verifier('un code de plus de 30 minutes : expiré (410)', rExp.status === 410 && rExp.json.state === 'expire');
  const rInv = await appeler(verifierCode, { phone: '0700000002', code: '12' }, {});
  verifier('un code qui n\'a pas 6 chiffres est refusé sans lire la base', rInv.status === 400);
}

/* ---------- 4. creer-livreur ---------- */
titre('creer-livreur : un appelant actif, avec l\'accès Opérations');
{
  const b = faireBase();
  b.tables.profiles.push(
    { id: '00000000-0000-4000-8000-0000000000a1', role: 'admin', status: 'valide' },
    { id: '00000000-0000-4000-8000-0000000000a2', role: 'equipe', status: 'valide', acces_operations: true },
    { id: '00000000-0000-4000-8000-0000000000a3', role: 'equipe', status: 'valide', acces_operations: false },
    { id: '00000000-0000-4000-8000-0000000000a4', role: 'admin', status: 'suspendu' },
  );
  const f = chargerFonction('creer-livreur', b);
  const corps = (tel) => ({ full_name: 'Nouveau', phone: tel, password: 'secret1' });
  verifier('un admin suspendu → 403', (await appeler(f, corps('0700000010'), { authorization: 'Bearer jeton:00000000-0000-4000-8000-0000000000a4' })).status === 403);
  verifier('une équipe SANS accès Opérations → 403', (await appeler(f, corps('0700000011'), { authorization: 'Bearer jeton:00000000-0000-4000-8000-0000000000a3' })).status === 403);
  verifier('une équipe avec accès Opérations → compte créé', (await appeler(f, corps('0700000012'), { authorization: 'Bearer jeton:00000000-0000-4000-8000-0000000000a2' })).status === 200);
  verifier('un admin → compte créé', (await appeler(f, corps('0700000013'), { authorization: 'Bearer jeton:00000000-0000-4000-8000-0000000000a1' })).status === 200);
  verifier('un numéro invalide → 400, même pour l\'admin', (await appeler(f, corps('12345'), { authorization: 'Bearer jeton:00000000-0000-4000-8000-0000000000a1' })).status === 400);
}

/* ---------- 5. Les écrans ---------- */
titre('Les écrans : la page Express attend le code, l\'équipe l\'envoie');
{
  const login = fs.readFileSync(path.join(RACINE, 'app', 'express-login.html'), 'utf8');
  const equipe = fs.readFileSync(path.join(RACINE, 'app', 'equipe.html'), 'utf8');
  const cfg = fs.readFileSync(path.join(RACINE, 'app', 'express-config.js'), 'utf8');
  verifier('la boîte d\'attente porte le formulaire du code (6 chiffres, one-time-code)', /id="form-code-express"/.test(login) && /id="code-express"[^>]*maxlength="6"/.test(login));
  verifier('le code part à verifier-code-express avec le numéro en attente', /functions\/v1\/verifier-code-express/.test(login) && /body: JSON\.stringify\(\{ phone: waitingPhone, code \}\)/.test(login));
  verifier('client comme coursier : après l\'inscription, la page attend le code (plus de connexion directe du client)', /showWaiting\(phone, password\);/.test(login) && !/Client : compte validé automatiquement/.test(login));
  verifier('l\'attente reflète l\'état : « numéro confirmé — pièce en cours » quand telephone_verifie_at est posé', /profile\.telephone_verifie_at/.test(login) && /Numéro confirmé — pièce en cours de vérification/.test(login));
  verifier('le profil Express est lu avec telephone_verifie_at', /telephone_verifie_at"\)/.test(cfg));
  verifier('équipe : « 📲 Envoyer le code » sur un compte Express non vérifié, « ✅ Numéro vérifié » sinon', /btn-envoyer-code/.test(equipe) && /✅ Numéro vérifié/.test(equipe) && /telephone_verifie_at'\)/.test(equipe));
  verifier('équipe : le code est demandé à envoyer-code-express et le lien WhatsApp porte le code et le numéro', /callAdminFunction\('envoyer-code-express', \{ user_id: id \}\)/.test(equipe) && /https:\/\/wa\.me\/\$\{num\}\?text=/.test(equipe));
}

/* ---------- 6. Le SQL, s'il est sur le poste ---------- */
titre('Le script SQL');
if (!fs.existsSync(CHEMIN_SQL)) {
  console.log('  (le script SQL n\'est pas sur ce poste : contrôle sauté)');
} else {
  const sql = fs.readFileSync(CHEMIN_SQL, 'utf8');
  verifier('profiles.telephone_verifie_at', /add column if not exists telephone_verifie_at timestamptz/.test(sql));
  verifier('express_codes_telephone : RLS, aucun droit anon/authenticated', /create table if not exists public\.express_codes_telephone/.test(sql) && /revoke all on public\.express_codes_telephone from anon, authenticated/.test(sql) && /alter table public\.express_codes_telephone enable row level security/.test(sql));
  verifier('express_inscriptions_tentatives : RLS, aucun droit anon/authenticated, index sur numéro et adresse', /create table if not exists public\.express_inscriptions_tentatives/.test(sql) && /revoke all on public\.express_inscriptions_tentatives from anon, authenticated/.test(sql) && /_phone_idx/.test(sql) && /_ip_idx/.test(sql));
  verifier('le script s\'inscrit au registre des migrations', /migration_appliquee\('2026-09-10-inscription-express-verifiee\.sql'/.test(sql));
}

console.log(`\n${reussies} réussie(s), ${echouees} échouée(s).`);
if (echouees) process.exit(1);
