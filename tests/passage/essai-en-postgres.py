#!/usr/bin/env python3
"""
DEMANDER UN PASSAGE — JOUÉ DANS UN VRAI POSTGRES — point 10.6, 17 septembre 2026
===========================================================================================
Une table neuve avec des règles d'accès : ce qui compte n'est pas qu'elle fonctionne, c'est
qu'elle ne laisse pas une cliente voir — ou pire, modifier — la demande d'une autre. Les
règles RLS ne se relisent pas, elles s'éprouvent : on se connecte tour à tour en cliente, en
autre cliente, en équipe et en livreur, et on regarde ce que chacun obtient vraiment.

USAGE
  python3 tests/passage/essai-en-postgres.py
"""

import os, subprocess, sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIGRATION = os.path.join(RACINE, "_sql-prive", "2026-09-17-demander-un-passage.sql")
BASE = "essai_passage_clt"

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


CLIENTE_A = '11111111-1111-1111-1111-111111111111'
CLIENTE_B = '22222222-2222-2222-2222-222222222222'
EQUIPE    = '33333333-3333-3333-3333-333333333333'
LIVREUR   = '44444444-4444-4444-4444-444444444444'

DECOR = f"""
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
create schema if not exists auth;
create table public.profiles (id uuid primary key, full_name text, role text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('essai.uid', true), '')::uuid $$;
create function public.migration_appliquee(nom text, resume text) returns text
  language sql as $$ select 'enregistrée : ' || nom $$;
-- Les fonctions de rôle de la maison, telles qu'elles sont en production : SECURITY DEFINER,
-- donc elles lisent profiles quel que soit ce que la RLS laisse voir à l'appelant.
create function public.is_admin() returns boolean language sql stable security definer as
  $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;
create function public.is_equipe() returns boolean language sql stable security definer as
  $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'equipe') $$;
create function public.is_livreur() returns boolean language sql stable security definer as
  $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'livreur') $$;
grant execute on function public.is_admin, public.is_equipe, public.is_livreur to authenticated;
insert into public.profiles values
  ('{CLIENTE_A}', 'Awa Koné', 'fournisseur'),
  ('{CLIENTE_B}', 'Sr Marie', 'fournisseur'),
  ('{EQUIPE}',    'Bureau',   'equipe'),
  ('{LIVREUR}',   'Kasimir',  'livreur');
"""


def comme(uid, sql):
    """Joue du SQL en tant que ce compte, avec la RLS appliquée (donc PAS en superutilisateur)."""
    return psql(f"set role authenticated; set essai.uid = '{uid}'; " + sql + " reset role;")


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

    print("\n1. La migration se joue, et se rejoue")
    migration = open(MIGRATION, encoding="utf-8").read()
    code, s = psql(migration)
    verifier("elle passe sans erreur", code == 0, s[-400:])
    code, s2 = psql(migration)
    verifier("la rejouer ne casse rien ni ne double les règles", code == 0, s2[-300:])
    code, s = psql("select count(*) from pg_policy where polrelid='public.demandes_de_passage'::regclass;")
    verifier("les trois règles d'accès sont posées, une seule fois chacune", s == "3", s)

    print("\n2. La cliente demande un passage")
    code, s = comme(CLIENTE_A, "insert into public.demandes_de_passage (jour, fournisseur_id, note) "
                               f"values ('2026-09-18', '{CLIENTE_A}', 'Après 14 h');")
    verifier("elle peut poser une demande pour elle-même", code == 0, s[-300:])
    code, s = comme(CLIENTE_A, "select jour, statut, note from public.demandes_de_passage;")
    verifier("elle la retrouve, en attente", s == "2026-09-18|en_attente|Après 14 h", s)
    # Redemander le même jour ne doit pas empiler : c'est le même souhait.
    code, s = comme(CLIENTE_A, "insert into public.demandes_de_passage (jour, fournisseur_id, note) "
                               f"values ('2026-09-18', '{CLIENTE_A}', 'Plutôt le matin') "
                               "on conflict (jour, fournisseur_id) do update set note = excluded.note, statut = 'en_attente';")
    code, s = comme(CLIENTE_A, "select count(*), max(note) from public.demandes_de_passage;")
    verifier("redemander le même jour remplace au lieu d'empiler", s == "1|Plutôt le matin", s)

    print("\n3. LE POINT DÉCISIF : une cliente ne voit pas la demande d'une autre")
    comme(CLIENTE_B, "insert into public.demandes_de_passage (jour, fournisseur_id) "
                     f"values ('2026-09-18', '{CLIENTE_B}');")
    code, s = comme(CLIENTE_A, "select count(*) from public.demandes_de_passage;")
    verifier("Awa ne voit que la sienne, pas celle de Sr Marie", s == "1", s)
    code, s = comme(CLIENTE_B, "select count(*) from public.demandes_de_passage;")
    verifier("et réciproquement", s == "1", s)
    code, s = comme(CLIENTE_A, f"update public.demandes_de_passage set note='piraté' where fournisseur_id='{CLIENTE_B}';"
                               " select count(*) from public.demandes_de_passage where note='piraté';")
    verifier("Awa ne peut pas modifier la demande de Sr Marie", s == "0", s)
    code, s = comme(CLIENTE_A, "insert into public.demandes_de_passage (jour, fournisseur_id) "
                               f"values ('2026-09-19', '{CLIENTE_B}');")
    verifier("ni en poser une au nom de Sr Marie", code != 0, "l'insertion aurait dû être refusée")

    print("\n4. Le bureau voit tout, le livreur lit, personne n'efface")
    code, s = comme(EQUIPE, "select count(*) from public.demandes_de_passage;")
    verifier("le bureau voit les deux demandes", s == "2", s)
    code, s = comme(LIVREUR, "select count(*) from public.demandes_de_passage;")
    verifier("le livreur aussi : il doit savoir qu'une cliente l'attend", s == "2", s)
    code, s = comme(EQUIPE, f"update public.demandes_de_passage set statut='traitee', traitee_par='{EQUIPE}', "
                            f"traitee_at=now() where fournisseur_id='{CLIENTE_A}'; "
                            "select statut from public.demandes_de_passage where statut='traitee';")
    verifier("le bureau peut marquer une demande traitée", s == "traitee", s)
    code, s = comme(LIVREUR, "update public.demandes_de_passage set statut='annulee'; "
                             "select count(*) from public.demandes_de_passage where statut='annulee';")
    verifier("un livreur ne peut PAS changer l'état d'une demande : il lit, il ne décide pas", s == "0", s)
    code, s = comme(EQUIPE, "delete from public.demandes_de_passage;")
    verifier("personne ne supprime : une demande annulée garde sa trace", code != 0 or
             comme(EQUIPE, "select count(*) from public.demandes_de_passage;")[1] == "2", s[-200:])

    print("\n5. Ce que la table refuse")
    code, s = comme(CLIENTE_A, "insert into public.demandes_de_passage (jour, fournisseur_id, statut) "
                               f"values ('2026-09-20', '{CLIENTE_A}', 'nimporte_quoi');")
    verifier("un état inventé est refusé", code != 0, "la contrainte aurait dû refuser")
    code, s = comme(CLIENTE_A, f"insert into public.demandes_de_passage (fournisseur_id) values ('{CLIENTE_A}');")
    verifier("une demande sans jour est refusée : un passage se demande pour une date", code != 0, "")
    code, s = comme(CLIENTE_A, "select (updated_at >= created_at) from public.demandes_de_passage limit 1;")
    verifier("la date de modification est tenue à jour", s == "t", s)

    psql(f"drop database if exists {BASE};", base="postgres")
    print(f"\n{reussies} réussie(s), {echouees} échouée(s).")
    return 1 if echouees else 0


if __name__ == "__main__":
    sys.exit(main())
