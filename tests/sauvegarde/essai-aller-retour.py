#!/usr/bin/env python3
"""
L'ESSAI DE RESTAURATION — point 6.5, 17 septembre 2026
===========================================================================================
Une sauvegarde que personne n'a jamais restaurée n'est pas une sauvegarde. Cet essai fait le
tour complet, pour de vrai, sans toucher à la production :

  1. Un faux Supabase (PostgREST) servi en local, avec des données inventées mais de la même
     forme que les vraies : des profils, des colis qui les référencent, de la paie, du jsonb,
     des accents, des apostrophes, des nuls, et assez de lignes pour forcer la pagination.
  2. Le VRAI script de sauvegarde tourne contre lui et écrit son dossier daté.
  3. Le VRAI script de restauration en tire un fichier SQL.
  4. Ce SQL est joué dans un VRAI Postgres, sur un schéma vide avec ses clés étrangères.
  5. On compare la base restaurée à la base de départ, ligne à ligne et valeur par valeur.

Si l'un de ces cinq pas casse, la sauvegarde ne vaut rien, et on veut le savoir maintenant.
"""
import json, os, shutil, subprocess, sys, tempfile, threading, urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUTILS = os.path.join(RACINE, "outils")

reussies = errs = 0
def verifier(t, ok, detail=None):
    global reussies, errs
    if ok: reussies += 1; print("  ✅ " + t)
    else:  errs += 1; print("  ❌ " + t + ("\n       → " + str(detail)[:400] if detail is not None else ""))

# ---------------------------------------------------------------- 1. le faux Supabase
def fabriquer_donnees():
    profils = [{"id": f"00000000-0000-4000-8000-{i:012d}", "full_name": f"Cliente n°{i} d'Abidjan",
                "role": "fournisseur", "phone": f"22507000{i:05d}", "commentaire": None}
               for i in range(1, 6)]
    profils[0]["full_name"] = "Awa « Boutique » Koné"      # guillemets
    profils[1]["full_name"] = "N'Guessan Marie-Thérèse"    # apostrophe + accents
    # 2 350 colis : au-dessus de la tranche de 1 000, pour forcer la pagination.
    colis = [{"id": f"11111111-0000-4000-8000-{i:012d}",
              "numero": f"CLT-260917-{i:05d}",
              "fournisseur_id": profils[i % 5]["id"],
              "montant_article": (i * 137) % 90000,
              "livre": i % 3 == 0,
              "observation": None if i % 4 else "Colis n°%d : l'adresse était « floue »" % i,
              "extra": {"tentatives": i % 3, "notes": ["a", "b"]} if i % 7 == 0 else None}
             for i in range(1, 2351)]
    return {
        "profiles": profils,
        "colis": colis,
        "gestion_bulletins": [{"id": f"22222222-0000-4000-8000-{i:012d}", "periode": "2026-08-01",
                               "statut": "valide", "net_a_payer": 150000 + i,
                               "snapshot": {"net": 150000 + i, "nom": "Koffi"}} for i in range(1, 4)],
        "table_vide": [],
        "livreur_positions": [{"id": "x", "lat": 5.3} for _ in range(10)],   # doit être IGNORÉE
    }

DONNEES = fabriquer_donnees()
CLE = "fausse-cle-de-service-pour-l-essai"

class Faux(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.headers.get("apikey") != CLE:
            self.send_response(401); self.end_headers(); self.wfile.write(b'{"message":"no"}'); return
        chemin = urllib.parse.urlparse(self.path).path
        if chemin == "/rest/v1/":
            spec = {"paths": {"/": {}, **{"/" + t: {} for t in DONNEES}, "/rpc/quelque_chose": {}}}
            corps = json.dumps(spec).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(corps))); self.end_headers(); self.wfile.write(corps); return
        table = chemin.rsplit("/", 1)[-1]
        if table not in DONNEES:
            self.send_response(404); self.end_headers(); self.wfile.write(b"[]"); return
        lignes = DONNEES[table]
        debut, fin = 0, len(lignes) - 1
        plage = self.headers.get("Range")
        if plage and "-" in plage:
            a, b = plage.split("-"); debut, fin = int(a), int(b)
        tranche = lignes[debut:fin + 1]
        # PostgREST omet les colonnes nulles de certaines lignes : on imite ce piège.
        tranche = [{k: v for k, v in l.items() if v is not None} for l in tranche]
        corps = json.dumps(tranche, ensure_ascii=False).encode()
        self.send_response(206 if plage else 200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Range", f"{debut}-{min(fin, len(lignes)-1)}/{len(lignes)}")
        self.send_header("Content-Length", str(len(corps))); self.end_headers(); self.wfile.write(corps)

serveur = HTTPServer(("127.0.0.1", 0), Faux)
port = serveur.server_address[1]
threading.Thread(target=serveur.serve_forever, daemon=True).start()

travail = tempfile.mkdtemp(prefix="clt-essai-sauvegarde-")
print("\n1. La sauvegarde tourne contre une base de la même forme que la vraie")

# On fait tourner le VRAI script, en détournant seulement l'adresse de la base.
src = open(os.path.join(OUTILS, "sauvegarde-des-donnees.py"), encoding="utf-8").read()
copie = os.path.join(travail, "sauvegarde.py")
open(copie, "w", encoding="utf-8").write(
    src.replace('URL_BASE = "https://xkfltqjbmolmdwdafzcx.supabase.co"', f'URL_BASE = "http://127.0.0.1:{port}"'))

dest = os.path.join(travail, "Sauvegardes")
r = subprocess.run([sys.executable, copie, dest], capture_output=True, text=True,
                   env={**os.environ, "CLT_CLE_SERVICE": CLE})
sortie = r.stdout + r.stderr
verifier("le script se termine bien", r.returncode == 0, sortie[-600:])
verifier("il annonce une sauvegarde vérifiée", "Sauvegarde vérifiée" in sortie, sortie[-300:])

jours = [d for d in os.listdir(dest)] if os.path.isdir(dest) else []
verifier("un dossier daté a été créé", len(jours) == 1, jours)
sauve = os.path.join(dest, jours[0]) if jours else ""
man = json.load(open(os.path.join(sauve, "MANIFESTE.json"), encoding="utf-8"))
verifier("le manifeste se déclare vérifié, sans écart", man["verifiee"] and not man["ecarts"], man.get("ecarts"))
verifier("la pagination a tout ramené : 2 350 colis, pas 1 000",
         next(d for d in man["detail"] if d["table"] == "colis")["lignes"] == 2350,
         next(d for d in man["detail"] if d["table"] == "colis")["lignes"])
verifier("une table vide est sauvegardée quand même (et vaut zéro)",
         any(d["table"] == "table_vide" and d["lignes"] == 0 for d in man["detail"]))
verifier("les tables qui se reconstruisent seules sont écartées",
         not any(d["table"] == "livreur_positions" for d in man["detail"]),
         [d["table"] for d in man["detail"]])
verifier("les tables ne sont pas codées en dur : elles viennent de la base",
         "liste_des_tables" in src and "DONNEES" not in src and "/rest/v1/" in src)
verifier("un LIRE-MOI accompagne la copie", os.path.exists(os.path.join(sauve, "LIRE-MOI.txt")))
csvs = os.listdir(os.path.join(sauve, "csv"))
verifier("chaque table a son JSON et son CSV", len(csvs) == len(man["detail"]), len(csvs))

print("\n2. Le CSV garde les colonnes que PostgREST avait tues")
import csv as csvmod
with open(os.path.join(sauve, "csv", "colis.csv"), encoding="utf-8", newline="") as f:
    tete = csvmod.DictReader(f).fieldnames
verifier("la colonne « observation », absente de certaines lignes, est bien une colonne",
         "observation" in tete and "extra" in tete, tete)

print("\n3. Le fichier de restauration se fabrique")
r2 = subprocess.run([sys.executable, os.path.join(OUTILS, "restaurer-une-sauvegarde.py"), sauve],
                    capture_output=True, text=True)
verifier("le script se termine bien", r2.returncode == 0, (r2.stdout + r2.stderr)[-500:])
sql_path = os.path.join(sauve, "RESTAURATION.sql")
sql = open(sql_path, encoding="utf-8").read()
verifier("profiles passe AVANT colis (sinon la clé étrangère refuse)",
         sql.index('insert into public."profiles"') < sql.index('insert into public."colis"'))
verifier("la restauration est une transaction, tout ou rien", sql.startswith("-- RESTAURATION") and "begin;" in sql and sql.rstrip().endswith("-- 4 table(s), 2358 ligne(s)."))
verifier("il ne s'exécute pas tout seul : c'est un fichier à relire",
         "psycopg" not in open(os.path.join(OUTILS, "restaurer-une-sauvegarde.py"), encoding="utf-8").read())

print("\n4. On le joue dans un VRAI Postgres, schéma vide, clés étrangères en place")
base = "clt_essai_restauration"
def psql(sql_txt, db="postgres", fichier=None):
    # -t -A : une valeur brute par ligne, sans en-tête ni colonnes alignées — lisible sans effort.
    cmd = ["su", "postgres", "-c", f'psql -t -A -v ON_ERROR_STOP=1 -d {db} ' + (f'-f {fichier}' if fichier else f'-c "{sql_txt}"')]
    return subprocess.run(cmd, capture_output=True, text=True)
psql(f"drop database if exists {base}")
psql(f"create database {base}")
schema = """
create table profiles (id uuid primary key, full_name text, role text, phone text, commentaire text);
create table colis (id uuid primary key, numero text, fournisseur_id uuid references profiles(id),
                    montant_article numeric, livre boolean, observation text, extra jsonb);
create table gestion_bulletins (id uuid primary key, periode date, statut text, net_a_payer numeric, snapshot jsonb);
create table table_vide (id uuid primary key);
"""
fs = os.path.join(travail, "schema.sql"); open(fs, "w").write(schema)
os.chmod(travail, 0o777); os.chmod(fs, 0o644); os.chmod(sql_path, 0o644)
rs = psql(None, base, fs)
verifier("le schéma vide est créé", rs.returncode == 0, rs.stderr[-300:])
rr = psql(None, base, sql_path)
verifier("le fichier de restauration passe sans erreur", rr.returncode == 0, rr.stderr[-600:])

print("\n5. La base restaurée est bien la base de départ")
def compte(t):
    c = psql(f"select count(*) from {t}", base)
    return int(c.stdout.strip()) if c.returncode == 0 and c.stdout.strip().isdigit() else -1
verifier("2 350 colis restaurés", compte("colis") == 2350, compte("colis"))
verifier("5 profils restaurés", compte("profiles") == 5, compte("profiles"))
verifier("3 bulletins restaurés", compte("gestion_bulletins") == 3, compte("gestion_bulletins"))
v = psql("select full_name from profiles where id = '00000000-0000-4000-8000-000000000002'", base)
verifier("l'apostrophe et les accents ont survécu (N'Guessan Marie-Thérèse)",
         "N'Guessan Marie-Thérèse" in v.stdout, v.stdout[:200])
v2 = psql("select full_name from profiles where id = '00000000-0000-4000-8000-000000000001'", base)
verifier("les guillemets aussi (Awa « Boutique » Koné)", "« Boutique »" in v2.stdout, v2.stdout[:200])
v3 = psql("select extra->>'tentatives' from colis where numero = 'CLT-260917-00007'", base)
verifier("le jsonb est revenu en jsonb, pas en texte", v3.stdout.strip() == "1", v3.stdout[:200])
v4 = psql("select count(*) from colis where observation is null", base)
# Le compte attendu se déduit des données de départ, jamais d'un nombre recopié à la main :
# c'est justement le genre d'erreur qu'un essai est censé attraper, pas commettre.
nuls_attendus = sum(1 for c in DONNEES["colis"] if c["observation"] is None)
verifier(f"les valeurs nulles sont restées nulles ({nuls_attendus} attendues)",
         int(v4.stdout.strip()) == nuls_attendus, v4.stdout[:200])
v5 = psql("select count(*) from colis c join profiles p on p.id = c.fournisseur_id", base)
verifier("chaque colis retrouve sa cliente : les liens tiennent", int(v5.stdout.strip()) == 2350, v5.stdout[:200])
rr2 = psql(None, base, sql_path)
verifier("rejouer la restauration ne double rien (on conflict do nothing)",
         rr2.returncode == 0 and compte("colis") == 2350, compte("colis"))

psql(f"drop database if exists {base}")
serveur.shutdown(); shutil.rmtree(travail, ignore_errors=True)
print(f"\n{reussies} réussie(s), {errs} échouée(s).")
sys.exit(1 if errs else 0)
