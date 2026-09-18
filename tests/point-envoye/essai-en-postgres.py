#!/usr/bin/env python3
"""
LE POINT A-T-IL ÉTÉ ENVOYÉ ? — JOUÉ DANS UN VRAI POSTGRES — 18 septembre 2026
===========================================================================================
Celtis : « Différentes personnes peuvent envoyer le même point. Même la même personne peut
envoyer plusieurs fois en se trompant. »

Ce que cet essai tient, et c'est tout le sujet : deux personnes qui cochent la même cliente le
même soir ne font qu'UNE marque, et c'est le nom de la première qui reste. Plus les droits, le
journal, et le fait que décocher ne laisse pas de fantôme.

Le décor est COPIÉ du vrai schéma (relevé le 18/09/2026), pas écrit de mémoire.

USAGE
  python3 tests/point-envoye/essai-en-postgres.py
"""

import os, subprocess

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIGRATION = os.path.join(RACINE, "_sql-prive", "2026-09-18-le-point-envoye.sql")
BASE = "essai_point_envoye_clt"

reussies = echouees = 0


def verifier(titre, condition, detail=None):
    global reussies, echouees
    if condition:
        reussies += 1
        print("  ✅ " + titre)
    else:
        echouees += 1
        print("  ❌ " + titre + (("\n       → " + str(detail)[:400]) if detail is not None else ""))


def psql(sql, base=BASE):
    args = ["psql", "-q", "-v", "ON_ERROR_STOP=1", "-d", base, "-At", "-F", "|"]
    r = subprocess.run(["su", "postgres", "-c", " ".join(
        ["'" + a.replace("'", "'\\''") + "'" for a in args])],
        input=sql, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip()


AWA = '11111111-1111-1111-1111-111111111111'      # une membre de l'équipe
BINTA = '22222222-2222-2222-2222-222222222222'    # une autre
LIVREUR = '33333333-3333-3333-3333-333333333333'
CLIENTE = '44444444-4444-4444-4444-444444444444'
CLIENTE2 = '55555555-5555-5555-5555-555555555555'

DECOR = f"""
create schema if not exists auth;
create table public.profiles (id uuid primary key, full_name text, role text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('essai.uid', true), '')::uuid $$;
create function public.migration_appliquee(nom text, resume text) returns text
  language sql as $$ select 'enregistrée : ' || nom $$;
-- Les deux portes d'accès, telles qu'elles existent en production : l'équipe et la compta.
create function public.a_acces_operations() returns boolean language sql stable as
  $$ select coalesce((select role from public.profiles where id = auth.uid()), '') in ('admin','equipe') $$;
create function public.a_acces_compta() returns boolean language sql stable as
  $$ select coalesce((select role from public.profiles where id = auth.uid()), '') = 'admin' $$;
create table public.activity_log (
  id bigserial primary key, actor_id uuid, actor_role text, action text,
  target_id uuid, target_type text, details jsonb, created_at timestamptz default now());
insert into public.profiles values
  ('{AWA}', 'Awa (bureau)', 'equipe'),
  ('{BINTA}', 'Binta (bureau)', 'equipe'),
  ('{LIVREUR}', 'Koffi Livreur', 'livreur'),
  ('{CLIENTE}', 'Mariam Mode', 'fournisseur'),
  ('{CLIENTE2}', 'Awa Boutique', 'fournisseur');
"""

JOUR = '2026-09-18'


def main():
    if not os.path.exists(MIGRATION):
        print("⏭️  " + MIGRATION + " est absent (dossier privé, hors dépôt) : essai sauté.")
        return 0
    subprocess.run(["service", "postgresql", "start"], capture_output=True)
    code, sortie = psql(f"drop database if exists {BASE}; create database {BASE};", base="postgres")
    if code != 0:
        print("⏭️  Postgres n'est pas joignable sur cette machine : essai sauté.\n   " + sortie[:200])
        return 0
    psql(DECOR)

    print("\n1. La migration passe, et se rejoue sans rien casser")
    migration = open(MIGRATION, encoding="utf-8").read()
    code, s = psql(migration)
    verifier("elle passe sans erreur", code == 0, s[-400:])
    code, s = psql(migration)
    verifier("elle se rejoue sans erreur (aucune marque perdue)", code == 0, s[-400:])
    code, s = psql("select count(*) from public.points_envoyes;")
    verifier("la table existe et part vide", s == "0", s)

    print("\n2. Cocher, et le voir")
    code, s = psql(f"set essai.uid = '{AWA}'; select public.marquer_point_envoye('{CLIENTE}', '{JOUR}') is not null;")
    verifier("Awa coche le point de Mariam : la marque rend l'heure", s == "t", s)
    code, s = psql(f"""select p.jour::text || '|' || q.full_name
                         from public.points_envoyes p join public.profiles q on q.id = p.envoye_par;""")
    verifier("la marque porte le jour et le nom de qui l'a posée", s == f"{JOUR}|Awa (bureau)", s)
    code, s = psql("select action, details->>'jour' from public.activity_log where action='point_envoye';")
    verifier("et le journal l'a notée", s == f"point_envoye|{JOUR}", s)

    print("\n3. LE POINT LE PLUS IMPORTANT : deux personnes, une seule marque")
    code, s = psql(f"set essai.uid = '{BINTA}'; select public.marquer_point_envoye('{CLIENTE}', '{JOUR}') is not null;")
    verifier("Binta coche la même cliente le même soir : pas d'erreur, elle est prévenue par l'écran", s == "t", s)
    code, s = psql("select count(*) from public.points_envoyes;")
    verifier("il n'y a toujours QU'UNE marque", s == "1", s)
    code, s = psql("""select q.full_name from public.points_envoyes p join public.profiles q on q.id = p.envoye_par;""")
    verifier("et c'est le nom d'Awa qui reste : celle qui a coché en premier", s == "Awa (bureau)", s)
    code, s = psql("select count(*) from public.activity_log where action='point_envoye';")
    verifier("les deux gestes sont au journal, pour savoir qui a cru devoir recocher", s == "2", s)

    print("\n4. Chaque cliente, chaque jour, sa marque")
    psql(f"set essai.uid = '{AWA}'; select public.marquer_point_envoye('{CLIENTE2}', '{JOUR}');")
    psql(f"set essai.uid = '{AWA}'; select public.marquer_point_envoye('{CLIENTE}', '2026-09-17');")
    code, s = psql("select count(*) from public.points_envoyes;")
    verifier("deux clientes et deux jours font trois marques distinctes", s == "3", s)
    code, s = psql(f"select count(*) from public.points_envoyes where jour = '{JOUR}';")
    verifier("le soir du 18, deux clientes ont eu leur point", s == "2", s)

    print("\n5. Décocher : une erreur se défait, et l'histoire reste")
    code, s = psql(f"set essai.uid = '{BINTA}'; select public.demarquer_point_envoye('{CLIENTE}', '{JOUR}');")
    verifier("Binta peut décocher ce qu'Awa avait coché : c'est un travail d'équipe", code == 0, s[-200:])
    code, s = psql(f"select count(*) from public.points_envoyes where fournisseur_id='{CLIENTE}' and jour='{JOUR}';")
    verifier("la marque est partie", s == "0", s)
    code, s = psql("""select details->>'marque_par' from public.activity_log where action='point_envoye_annule';""")
    verifier("le journal garde qui l'avait posée", s == AWA, s)
    code, s = psql(f"set essai.uid = '{AWA}'; select public.marquer_point_envoye('{CLIENTE}', '{JOUR}') is not null;")
    verifier("et on peut recocher derrière, sans rien de bloqué", s == "t", s)
    code, s = psql(f"set essai.uid = '{AWA}'; select public.demarquer_point_envoye('{CLIENTE}', '2026-01-01');")
    verifier("décocher ce qui n'est pas coché ne casse rien", code == 0, s[-200:])

    print("\n6. Qui peut cocher")
    code, s = psql(f"set essai.uid = '{LIVREUR}'; select public.marquer_point_envoye('{CLIENTE2}', '2026-09-16');")
    verifier("un livreur ne coche pas : ce n'est pas lui qui envoie le relevé", code != 0 and 'Acc' in s, s[-200:])
    code, s = psql(f"set essai.uid = '{CLIENTE}'; select public.marquer_point_envoye('{CLIENTE2}', '2026-09-16');")
    verifier("une cliente non plus", code != 0, s[-200:])
    code, s = psql(f"set essai.uid = '{LIVREUR}'; select public.demarquer_point_envoye('{CLIENTE2}', '{JOUR}');")
    verifier("et un livreur ne décoche pas davantage", code != 0, s[-200:])
    code, s = psql("select count(*) from public.points_envoyes;")
    verifier("rien n'a bougé après ces trois refus", s == "3", s)

    print("\n7. Ce que la table n'accepte pas")
    code, s = psql(f"""insert into public.points_envoyes (fournisseur_id, jour, envoye_par)
                       values ('{CLIENTE}', '{JOUR}', '{AWA}');""")
    verifier("un doublon (cliente, jour) est refusé par la base, pas seulement par l'écran",
             code != 0 and ('unique' in s.lower() or 'duplicate' in s.lower()), s[-200:])
    code, s = psql("""select count(*) from pg_policies where tablename='points_envoyes' and cmd='INSERT';""")
    verifier("aucune écriture directe n'est ouverte : tout passe par les deux fonctions", s == "0", s)

    print(f"\n{reussies} réussie(s), {echouees} échouée(s).")
    return 1 if echouees else 0


if __name__ == "__main__":
    raise SystemExit(main())
