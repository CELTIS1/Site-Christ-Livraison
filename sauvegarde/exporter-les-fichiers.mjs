#!/usr/bin/env node
/* EXPORTER LES FICHIERS DE SUPABASE STORAGE (20/09/2026, lot 20.H)
   ==========================================================================================
   Les photos des colis, des remises et des retours, les avatars, les pièces d'identité des
   coursiers vivent dans Storage, pas dans la base : pg_dump n'en copie que la liste. Ce script
   les télécharge tous, bucket par bucket, dans un dossier — que la sauvegarde nocturne chiffre
   avec le reste. Il ne lit que deux variables d'environnement, jamais posées dans le code :
     SUPABASE_URL                 https://<projet>.supabase.co
     SUPABASE_SERVICE_ROLE_KEY    la clé service (lit tout, y compris les buckets privés)

   Usage :  node sauvegarde/exporter-les-fichiers.mjs <dossier de sortie>
   Rejouable : un fichier déjà présent avec la même taille n'est pas retéléchargé. */
import fs from 'node:fs';
import path from 'node:path';

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const CLE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SORTIE = process.argv[2] || 'fichiers';
if (!URL_BASE || !CLE) { console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont nécessaires.'); process.exit(1); }

const entetes = { apikey: CLE, Authorization: 'Bearer ' + CLE };
async function json(url, corps) {
  const r = await fetch(url, { method: corps ? 'POST' : 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, entetes), body: corps ? JSON.stringify(corps) : undefined });
  if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 200) + ' — ' + url);
  return r.json();
}

/* La liste d'un bucket est paginée et arborescente : un « objet » sans id est un dossier, on y
   descend. 1 000 par page, jusqu'à épuisement. */
async function lister(bucket, prefixe, acc) {
  let offset = 0;
  for (;;) {
    const page = await json(`${URL_BASE}/storage/v1/object/list/${bucket}`, { prefix: prefixe, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    for (const o of page) {
      const chemin = prefixe ? prefixe + '/' + o.name : o.name;
      if (o.id === null || o.id === undefined) await lister(bucket, chemin, acc);
      else acc.push({ chemin, taille: (o.metadata && o.metadata.size) || 0 });
    }
    if (page.length < 1000) break;
    offset += page.length;
  }
  return acc;
}

async function telecharger(bucket, chemin, vers) {
  const r = await fetch(`${URL_BASE}/storage/v1/object/${bucket}/${chemin.split('/').map(encodeURIComponent).join('/')}`, { headers: entetes });
  if (!r.ok) throw new Error(r.status + ' sur ' + bucket + '/' + chemin);
  fs.mkdirSync(path.dirname(vers), { recursive: true });
  fs.writeFileSync(vers, Buffer.from(await r.arrayBuffer()));
}

const buckets = await json(`${URL_BASE}/storage/v1/bucket`);
let total = 0, octets = 0, sautes = 0;
for (const b of buckets) {
  const objets = await lister(b.name, '', []);
  console.log(`${b.name} : ${objets.length} fichier(s)`);
  for (const o of objets) {
    const vers = path.join(SORTIE, b.name, o.chemin);
    try {
      if (fs.existsSync(vers) && o.taille && fs.statSync(vers).size === o.taille) { sautes++; continue; }
      await telecharger(b.name, o.chemin, vers);
      total++; octets += o.taille || 0;
    } catch (e) { console.warn('  ⚠️ ' + e.message); }
  }
}
fs.mkdirSync(SORTIE, { recursive: true });
fs.writeFileSync(path.join(SORTIE, 'INVENTAIRE.json'), JSON.stringify({ quand: new Date().toISOString(), buckets: buckets.map(b => b.name), fichiers: total, deja_la: sautes, octets }, null, 2));
console.log(`Terminé : ${total} fichier(s) copié(s), ${sautes} déjà là, ${(octets / 1048576).toFixed(1)} Mo.`);
