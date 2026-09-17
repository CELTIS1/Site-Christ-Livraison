#!/usr/bin/env python3
"""
RESTAURER À PARTIR D'UNE SAUVEGARDE — point 6.5, 17 septembre 2026
===========================================================================================
Le jour où il faut s'en servir, personne n'aura le temps d'inventer la marche à suivre. Ce
script transforme une sauvegarde (le dossier daté écrit par sauvegarde-des-donnees.py) en un
fichier SQL qui remet les données dans une base Postgres vide — celle d'un nouveau projet
Supabase, par exemple.

IL N'ÉCRIT JAMAIS DANS UNE BASE. Il produit un fichier, qu'un humain relit et joue lui-même.
C'est volontaire : une restauration se décide, elle ne se déclenche pas par accident.

L'ORDRE DES TABLES COMPTE. On ne peut pas insérer un colis avant la cliente à qui il appartient :
la clé étrangère refuse. Le script range donc les tables par dépendances, avec profiles en tête,
et désactive les déclencheurs le temps de l'insertion — ce que fait tout outil de restauration.

USAGE
  python3 restaurer-une-sauvegarde.py <dossier de la sauvegarde> [fichier .sql de sortie]
"""

import json, os, sys
from datetime import datetime

# Les tables dont tout le reste dépend, dans l'ordre où elles doivent entrer. Le reste suit,
# par ordre alphabétique : les clés étrangères restantes sont désactivées pendant l'insertion.
EN_TETE = ["profiles", "colis", "gestion_salaries", "gestion_chauffeurs", "gestion_clients"]


def litteral(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def main():
    if len(sys.argv) < 2:
        print("Usage : python3 restaurer-une-sauvegarde.py <dossier de la sauvegarde> [sortie.sql]")
        return 2
    dossier = sys.argv[1]
    sortie = sys.argv[2] if len(sys.argv) > 2 else os.path.join(dossier, "RESTAURATION.sql")
    djson = os.path.join(dossier, "json")
    if not os.path.isdir(djson):
        print(f"❌ Pas de dossier json/ dans {dossier} : ce n'est pas une sauvegarde.")
        return 2

    manifeste = {}
    cm = os.path.join(dossier, "MANIFESTE.json")
    if os.path.exists(cm):
        with open(cm, encoding="utf-8") as f:
            manifeste = json.load(f)
    if manifeste and not manifeste.get("verifiee", True):
        print("⚠️  Cette sauvegarde s'est déclarée INCOMPLÈTE le jour où elle a été prise.")
        print("   On peut quand même s'en servir, mais il manquera ce qui manquait déjà.")

    fichiers = sorted(f for f in os.listdir(djson) if f.endswith(".json"))
    tables = [t for t in EN_TETE if t + ".json" in fichiers] + \
             [f[:-5] for f in fichiers if f[:-5] not in EN_TETE]

    total, lignes_sql = 0, []
    lignes_sql.append("-- RESTAURATION DES DONNÉES CLT")
    lignes_sql.append(f"-- Sauvegarde du {manifeste.get('sauvegarde_le', '(date inconnue)')}, "
                      f"fichier produit le {datetime.now().strftime('%Y-%m-%d %H:%M')}.")
    lignes_sql.append("--")
    lignes_sql.append("-- À jouer sur une base dont le SCHÉMA existe déjà (tables créées, vides).")
    lignes_sql.append("-- Relisez RESTAURATION.md avant : l'ordre des opérations y est écrit.")
    lignes_sql.append("")
    lignes_sql.append("begin;")
    lignes_sql.append("set session_replication_role = replica;  -- clés étrangères et déclencheurs en veille")
    lignes_sql.append("")

    for t in tables:
        with open(os.path.join(djson, t + ".json"), encoding="utf-8") as f:
            donnees = json.load(f)
        if not donnees:
            lignes_sql.append(f"-- {t} : aucune ligne.")
            continue
        colonnes = []
        for l in donnees:
            for k in l:
                if k not in colonnes:
                    colonnes.append(k)
        lignes_sql.append(f"-- {t} : {len(donnees)} ligne(s)")
        cols = ", ".join('"%s"' % c for c in colonnes)
        for i in range(0, len(donnees), 500):          # des paquets, pas une requête d'un mégaoctet
            paquet = donnees[i:i + 500]
            valeurs = ",\n  ".join(
                "(" + ", ".join(litteral(l.get(c)) for c in colonnes) + ")" for l in paquet)
            lignes_sql.append(f'insert into public."{t}" ({cols}) values\n  {valeurs}\non conflict do nothing;')
        lignes_sql.append("")
        total += len(donnees)

    lignes_sql.append("set session_replication_role = origin;")
    lignes_sql.append("commit;")
    lignes_sql.append("")
    lignes_sql.append(f"-- {len(tables)} table(s), {total} ligne(s).")

    with open(sortie, "w", encoding="utf-8") as f:
        f.write("\n".join(lignes_sql) + "\n")

    print(f"✅ Fichier de restauration écrit : {sortie}")
    print(f"   {len(tables)} table(s), {total} ligne(s).")
    print("")

    # LES DONNÉES NE SUFFISENT PAS. Elles entrent dans des tables qui doivent déjà exister,
    # avec leurs règles d'accès et leurs déclencheurs. Ce SQL-là est dans la sauvegarde aussi,
    # dans sql/ — et il se joue AVANT. Le dire ici évite qu'on s'en aperçoive au mauvais moment.
    dossier_sql = os.path.join(dossier, "sql")
    migrations = sorted(n for n in os.listdir(dossier_sql) if n.endswith(".sql")) \
        if os.path.isdir(dossier_sql) else []
    if migrations:
        print(f"   ⚠️  D'ABORD LA BASE, ENSUITE LES DONNÉES.")
        print(f"   Cette sauvegarde contient {len(migrations)} migrations dans sql/. Sur une base")
        print(f"   neuve, jouez-les d'abord, dans l'ordre des noms (ils commencent par la date) :")
        print(f"   la première est « {migrations[0]} », la dernière « {migrations[-1]} ».")
    else:
        print("   ⚠️  Cette sauvegarde ne contient PAS le SQL de la base (pas de dossier sql/).")
        print("      Sur une base neuve, il faudra retrouver les migrations ailleurs : le")
        print("      dossier _sql-prive du Mac de la gérance, ou une sauvegarde plus récente.")
    print("")
    print("   Relisez le fichier, puis jouez-le dans Supabase > SQL Editor sur la base à restaurer.")
    print("   Il ne s'exécute pas tout seul : une restauration se décide.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
