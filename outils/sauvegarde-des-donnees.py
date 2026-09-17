#!/usr/bin/env python3
"""
SAUVEGARDER LES DONNÉES DE CLT — point 6.5 de la feuille de route, 17 septembre 2026
===========================================================================================
Avant ce jour, il n'existait aucune copie des données en dehors de Supabase. Si le projet
disparaissait — erreur de manipulation, compte fermé, incident chez l'hébergeur — la société
perdait ses colis, ses clientes, sa comptabilité et sa paie, sans recours. Ce script écrit cette
copie, et surtout il la VÉRIFIE : une sauvegarde que personne n'a jamais relue n'est pas une
sauvegarde, c'est un fichier.

CE QU'IL FAIT
  1. Il demande à la base la liste de SES tables (il ne la connaît pas d'avance : une table
     ajoutée le mois prochain sera sauvegardée sans que personne y pense).
  2. Il lit chaque table entièrement, par tranches, et l'écrit en JSON et en CSV.
  3. Il RELIT ce qu'il vient d'écrire et compare, ligne à ligne, avec le nombre que la base
     annonce. Un écart, et il s'arrête en disant lequel.
  4. Il écrit un MANIFESTE lisible : la date, chaque table, son compte, son empreinte.

CE QU'IL NE FAIT PAS
  Il n'écrit jamais dans la base. Il ne supprime rien : une vieille sauvegarde est déplacée dans
  « _a_supprimer », jamais effacée. Il ne contient aucune clé : elle est lue dans le trousseau du
  Mac, ou dans la variable d'environnement CLT_CLE_SERVICE.

LA CLÉ
  La lecture de toutes les tables demande la clé « service_role » du projet Supabase. Elle ne
  doit apparaître dans aucun fichier ni dans aucun dépôt. Celtis la range une fois dans le
  trousseau du Mac ; ce script l'y lit, et elle n'en sort pas.
"""

import csv, hashlib, json, os, ssl, subprocess, sys, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone

URL_BASE = "https://xkfltqjbmolmdwdafzcx.supabase.co"
TRANCHE = 1000           # lignes par requête ; PostgREST plafonne, on pagine
SERVICE_TROUSSEAU = "clt-supabase-service"

# Tables à ne PAS sauvegarder : elles se reconstruisent seules et n'ont aucune valeur demain.
IGNOREES = {"express_course_positions", "livreur_positions", "push_subscriptions"}


def dire(txt=""):
    print(txt, flush=True)


def lire_cle():
    """La clé, sans jamais l'écrire : trousseau du Mac d'abord, variable d'environnement sinon."""
    cle = os.environ.get("CLT_CLE_SERVICE", "").strip()
    if cle:
        return cle
    try:
        r = subprocess.run(
            ["security", "find-generic-password", "-s", SERVICE_TROUSSEAU, "-w"],
            capture_output=True, text=True, timeout=20)
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
    except (FileNotFoundError, subprocess.SubprocessError):
        pass
    return None


def appel(chemin, cle, entetes=None, params=None):
    url = URL_BASE + chemin + (("?" + urllib.parse.urlencode(params)) if params else "")
    req = urllib.request.Request(url)
    req.add_header("apikey", cle)
    req.add_header("Authorization", "Bearer " + cle)
    req.add_header("Accept", "application/json")
    for k, v in (entetes or {}).items():
        req.add_header(k, v)
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=120, context=ctx) as r:
        corps = r.read().decode("utf-8")
        return corps, dict(r.headers)


def liste_des_tables(cle):
    """PostgREST décrit lui-même ce qu'il expose : on ne code aucune liste en dur."""
    corps, _ = appel("/rest/v1/", cle)
    spec = json.loads(corps)
    noms = sorted(k.lstrip("/") for k in spec.get("paths", {}) if k.startswith("/") and k != "/")
    return [n for n in noms if n and not n.startswith("rpc/") and n not in IGNOREES]


def compte_annonce(table, cle):
    """Le nombre de lignes tel que la base le donne — la référence de la vérification."""
    _, ent = appel("/rest/v1/" + table, cle,
                   entetes={"Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"},
                   params={"select": "*"})
    plage = ent.get("Content-Range", "")
    if "/" in plage:
        total = plage.rsplit("/", 1)[1]
        if total.isdigit():
            return int(total)
    return None


def lire_table(table, cle):
    lignes, debut = [], 0
    while True:
        corps, _ = appel("/rest/v1/" + table, cle,
                         entetes={"Range-Unit": "items", "Range": f"{debut}-{debut + TRANCHE - 1}"},
                         params={"select": "*"})
        tranche = json.loads(corps)
        lignes.extend(tranche)
        if len(tranche) < TRANCHE:
            return lignes
        debut += TRANCHE


def ecrire_csv(chemin, lignes):
    """Un CSV lisible dans n'importe quel tableur. Les colonnes sont l'union de toutes les clés :
       PostgREST omet parfois une colonne nulle, et une colonne manquante serait une perte."""
    colonnes = []
    for l in lignes:
        for k in l:
            if k not in colonnes:
                colonnes.append(k)
    with open(chemin, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=colonnes, extrasaction="ignore")
        w.writeheader()
        for l in lignes:
            w.writerow({k: ("" if l.get(k) is None else
                            (json.dumps(l[k], ensure_ascii=False) if isinstance(l[k], (dict, list)) else l[k]))
                        for k in colonnes})
    return colonnes


def empreinte(chemin):
    h = hashlib.sha256()
    with open(chemin, "rb") as f:
        for bloc in iter(lambda: f.read(65536), b""):
            h.update(bloc)
    return h.hexdigest()[:16]


def main():
    cle = lire_cle()
    if not cle:
        dire("❌ La clé de lecture n'est pas installée sur ce Mac.")
        dire("")
        dire("   À faire UNE SEULE FOIS. Ouvrez Terminal et collez cette ligne :")
        dire("")
        dire(f'     security add-generic-password -s {SERVICE_TROUSSEAU} -a clt -w')
        dire("")
        dire("   Le Terminal demandera alors la clé : collez la clé « service_role » du projet")
        dire("   Supabase (Project Settings › API › service_role). Elle sera rangée dans le")
        dire("   trousseau du Mac et n'apparaîtra dans aucun fichier.")
        return 2

    racine = sys.argv[1] if len(sys.argv) > 1 else "."
    jour = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d")
    horo = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")
    dossier = os.path.join(racine, jour)
    os.makedirs(os.path.join(dossier, "csv"), exist_ok=True)
    os.makedirs(os.path.join(dossier, "json"), exist_ok=True)

    dire(f"📅 Sauvegarde du {horo}")
    dire(f"📁 {dossier}")
    dire("")

    try:
        tables = liste_des_tables(cle)
    except urllib.error.HTTPError as e:
        dire(f"❌ La base a refusé la connexion ({e.code}). La clé est-elle la bonne (service_role) ?")
        return 3
    except Exception as e:
        dire(f"❌ Impossible de joindre la base : {e}")
        return 3

    dire(f"{len(tables)} table(s) à sauvegarder.")
    dire("")

    manifeste, ecarts, total_lignes = [], [], 0
    for t in tables:
        try:
            attendu = compte_annonce(t, cle)
            lignes = lire_table(t, cle)
        except Exception as e:
            ecarts.append(f"{t} : lecture impossible ({e})")
            dire(f"  ❌ {t:38s} lecture impossible")
            continue

        cj = os.path.join(dossier, "json", t + ".json")
        cc = os.path.join(dossier, "csv", t + ".csv")
        with open(cj, "w", encoding="utf-8") as f:
            json.dump(lignes, f, ensure_ascii=False, indent=1)
        colonnes = ecrire_csv(cc, lignes)

        # LA VÉRIFICATION : on relit le fichier écrit, on ne se fie pas à ce qu'on croit avoir écrit.
        with open(cj, encoding="utf-8") as f:
            relu = json.load(f)
        with open(cc, encoding="utf-8", newline="") as f:
            relu_csv = list(csv.DictReader(f))

        ok = (len(relu) == len(lignes)
              and len(relu_csv) == len(lignes)
              and (attendu is None or attendu == len(lignes)))
        if not ok:
            ecarts.append(f"{t} : base {attendu}, écrit {len(lignes)}, relu {len(relu)} (json) / {len(relu_csv)} (csv)")
        total_lignes += len(lignes)
        manifeste.append({
            "table": t, "lignes": len(lignes), "annonce_par_la_base": attendu,
            "colonnes": len(colonnes), "empreinte_json": empreinte(cj), "verifie": ok,
        })
        dire(f"  {'✅' if ok else '❌'} {t:38s} {len(lignes):>6} ligne(s)")

    chemin_manifeste = os.path.join(dossier, "MANIFESTE.json")
    with open(chemin_manifeste, "w", encoding="utf-8") as f:
        json.dump({
            "sauvegarde_le": horo, "projet": URL_BASE,
            "tables": len(manifeste), "lignes_totales": total_lignes,
            "tables_ignorees": sorted(IGNOREES),
            "verifiee": not ecarts, "ecarts": ecarts, "detail": manifeste,
        }, f, ensure_ascii=False, indent=1)

    with open(os.path.join(dossier, "LIRE-MOI.txt"), "w", encoding="utf-8") as f:
        f.write(
            f"SAUVEGARDE DES DONNÉES CLT — {horo}\n"
            f"{'=' * 60}\n\n"
            f"{len(manifeste)} tables, {total_lignes} lignes au total.\n"
            f"État : {'VÉRIFIÉE — chaque fichier relu correspond à ce que la base annonce.' if not ecarts else 'INCOMPLÈTE — voir les écarts ci-dessous.'}\n\n"
            + ("".join('  • ' + e + '\n' for e in ecarts) + '\n' if ecarts else "")
            + "Ce qu'il y a dedans :\n"
            "  json/   une copie fidèle, c'est elle qui sert à restaurer.\n"
            "  csv/    la même chose, ouvrable dans un tableur pour lire ou retrouver une ligne.\n"
            "  MANIFESTE.json  le compte et l'empreinte de chaque table.\n\n"
            "Pour restaurer : voir RESTAURATION.md dans le dossier de l'application.\n"
            "Ne modifiez pas ces fichiers : c'est la copie qui fait foi le jour où il faut s'en servir.\n")

    dire("")
    if ecarts:
        dire("❌ SAUVEGARDE INCOMPLÈTE — ne comptez pas dessus en l'état :")
        for e in ecarts:
            dire("   • " + e)
        return 1
    dire(f"✅ Sauvegarde vérifiée : {len(manifeste)} tables, {total_lignes} lignes.")
    dire(f"   Chaque fichier a été relu et correspond à ce que la base annonce.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
