#!/usr/bin/env python3
"""
LES BOUTIQUES SUPERVISÉES — JOUÉES DANS UN VRAI POSTGRES — 20 septembre 2026
============================================================================
Celtis : « le responsable à qui appartiennent toutes ces boutiques doit se connecter sur chacun
des comptes… est-ce possible d'avoir son espace où il voit l'ensemble ? »

Ce que la migration doit garantir, et que seul un vrai Postgres peut prouver : le propriétaire
LIT les colis de ses boutiques, ne lit pas ceux des autres, n'ÉCRIT rien, et le bureau seul
fait le lien.

USAGE
  python3 tests/boutiques/essai-en-postgres.py
"""

import os, subprocess

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIGRATION = os.path.join(RACINE, "_sql-prive", "2026-09-20-les-boutiques-supervisees.sql")
BASE = "essai_boutiques_clt"

reussies = echouees = 0


def verifier(titre, condition, detail=None):
    global reussies, echouees
    if condition:
        reussies += 1
        print("  ✅ " + titre)
    else:
        echouees += 1
        print("  ❌ " + titre + (("\n       → " + str(detail)[:500]) if detail is not None else ""))


def psql(sql, base=BASE):
    args = ["psql", "-q", "-v", "ON_ERROR_STOP=1", "-d", base, "-At", "-F", "|"]
    r = subprocess.run(["su", "postgres", "-c", " ".join(
        ["'" + a.replace("'", "'\\''") + "'" for a in args])],
        input=sql, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip()


PROPRIO  = "11111111-1111-1111-1111-111111111111"
GERANT1  = "22222222-2222-2222-2222-222222222222"
GERANT2  = "33333333-3333-3333-3333-333333333333"
AUTRE    = "44444444-4444-4444-4444-444444444444"
BUREAU   = "55555555-5555-5555-5555-555555555555"

DECOR = f"""
create schema if not exists auth;
create table public.qui_parle (id uuid);
insert into public.qui_parle values (null);
create function auth.uid() returns uuid language sql stable as $$ select id from public.qui_parle limit 1 $$;
create function public.migration_appliquee(nom text, resume text) returns text language sql as $$ select 'ok' $$;
create table public.profiles (id uuid primary key, role text, full_name text, company_name text, commune_recuperation text, avatar_url text, phone text, status text default 'valide', acces_operations boolean default false);
insert into public.profiles (id, role, full_name, company_name, commune_recuperation, phone, acces_operations) values
  ('{PROPRIO}','fournisseur','Madame Koné','Koné Group','Cocody','0700000001',false),
  ('{GERANT1}','fournisseur','Awa','Koné Boutique Yopougon','Yopougon','0700000002',false),
  ('{GERANT2}','fournisseur','Mariam','Koné Boutique Marcory','Marcory','0700000003',false),
  ('{AUTRE}','fournisseur','Fatou','Fatou Mode','Abobo','0700000004',false),
  ('{BUREAU}','equipe','Le Bureau',null,null,'0700000005',true);
create function public.is_equipe() returns boolean language sql stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('equipe','admin')) $$;
create function public.a_acces_operations() returns boolean language sql stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and (role = 'admin' or acces_operations)) $$;
create table public.colis (id uuid primary key default gen_random_uuid(), numero text, statut text, fournisseur_id uuid, montant_article numeric);
insert into public.colis (numero, statut, fournisseur_id, montant_article) values
  ('G1-A','livre','{GERANT1}',5000), ('G1-B','en_livraison','{GERANT1}',7000),
  ('G2-A','livre','{GERANT2}',9000),
  ('AU-A','livre','{AUTRE}',1000),
  ('PR-A','en_attente','{PROPRIO}',2000);
alter table public.colis enable row level security; alter table public.colis force row level security;
create policy colis_select_fournisseur on public.colis for select using (fournisseur_id = auth.uid());
create policy colis_update_fournisseur on public.colis for update using (fournisseur_id = auth.uid()) with check (fournisseur_id = auth.uid());
create policy colis_select_team on public.colis for select using (public.a_acces_operations());
alter table public.profiles enable row level security; alter table public.profiles force row level security;
create policy profiles_soi on public.profiles for select using (id = auth.uid() or public.is_equipe());
-- La vue du relevé, telle qu'en base : security_invoker, elle hérite des règles de colis.
create view public.releve_fournisseur with (security_invoker = true) as
  select fournisseur_id, count(*) filter (where statut = 'livre') as colis_livres,
         sum(montant_article) filter (where statut = 'livre') as total_encaisse_pour_vous
    from public.colis group by fournisseur_id;
"""


def parler(qui):
    return f"update public.qui_parle set id = {('null' if qui is None else repr(qui) + '::uuid')};"


def main():
    psql(f"drop database if exists {BASE};", base="postgres")
    psql("drop role if exists lecteur_boutiques;", base="postgres")
    code, out = psql(f"create database {BASE};", base="postgres")
    assert code == 0, out
    code, out = psql(DECOR)
    assert code == 0, out

    print("\nLa migration")
    with open(MIGRATION, encoding="utf-8") as f:
        sql = f.read()
    code, out = psql(sql)
    verifier("passe sans erreur", code == 0, out)
    code, out = psql(sql)
    verifier("et se rejoue sans erreur", code == 0, out)
    code, out = psql("create role lecteur_boutiques in role authenticated; grant usage on schema public, auth to lecteur_boutiques; grant select, insert, update, delete on all tables in schema public to lecteur_boutiques; grant execute on all functions in schema public to lecteur_boutiques; grant execute on all functions in schema auth to lecteur_boutiques; alter table public.boutiques_supervisees force row level security;")
    assert code == 0, out

    print("\nAvant tout lien : le propriétaire ne voit que ses propres colis")
    code, out = psql(parler(PROPRIO) + "set role lecteur_boutiques; select string_agg(numero, ',' order by numero) from public.colis;")
    verifier("un seul colis, le sien", out == "PR-A", out)
    code, out = psql(parler(PROPRIO) + "set role lecteur_boutiques; select count(*) from public.mes_boutiques();")
    verifier("mes_boutiques() est vide", out == "0", out)

    print("\nLe lien : le bureau seul")
    code, out = psql(parler(PROPRIO) + f"set role lecteur_boutiques; insert into public.boutiques_supervisees (superviseur_id, fournisseur_id) values ('{PROPRIO}','{GERANT1}');")
    verifier("le propriétaire ne peut pas se rattacher une boutique lui-même", code != 0, out)
    code, out = psql(parler(GERANT1) + f"set role lecteur_boutiques; insert into public.boutiques_supervisees (superviseur_id, fournisseur_id) values ('{PROPRIO}','{GERANT1}');")
    verifier("ni le gérant", code != 0, out)
    code, out = psql(parler(BUREAU) + f"set role lecteur_boutiques; insert into public.boutiques_supervisees (superviseur_id, fournisseur_id, cree_par) values ('{PROPRIO}','{GERANT1}','{BUREAU}'), ('{PROPRIO}','{GERANT2}','{BUREAU}');")
    verifier("le bureau rattache deux boutiques", code == 0, out)
    code, out = psql(parler(BUREAU) + f"set role lecteur_boutiques; insert into public.boutiques_supervisees (superviseur_id, fournisseur_id) values ('{PROPRIO}','{PROPRIO}');")
    verifier("on ne se supervise pas soi-même", code != 0, out)

    print("\nAprès le lien : il voit ses boutiques, et rien d'autre")
    code, out = psql(parler(PROPRIO) + "set role lecteur_boutiques; select string_agg(nom, ',' order by nom) from public.mes_boutiques();")
    verifier("mes_boutiques() nomme les deux boutiques (nom d'enseigne)", out == "Koné Boutique Marcory,Koné Boutique Yopougon", out)
    code, out = psql(parler(PROPRIO) + "set role lecteur_boutiques; select string_agg(numero, ',' order by numero) from public.colis;")
    verifier("il lit les colis des deux boutiques et les siens — pas ceux de Fatou", out == "G1-A,G1-B,G2-A,PR-A", out)
    code, out = psql(parler(PROPRIO) + "set role lecteur_boutiques; select string_agg(fournisseur_id::text||'='||total_encaisse_pour_vous::text, ',' order by 1) from public.releve_fournisseur;")
    verifier("le relevé de chaque boutique lui est lisible (la vue hérite)", f"{GERANT1}=5000" in out and f"{GERANT2}=9000" in out and AUTRE not in out, out)
    code, out = psql(parler(PROPRIO) + "set role lecteur_boutiques; select count(*) from public.profiles;")
    verifier("mais l'annuaire ne s'ouvre pas : il ne voit que son profil", out == "1", out)
    code, out = psql(parler(PROPRIO) + "set role lecteur_boutiques; update public.colis set statut = 'livre' where numero = 'G1-B'; reset role; select statut from public.colis where numero = 'G1-B';")
    verifier("il ne peut RIEN écrire sur un colis d'une boutique (la mise à jour ne touche aucune ligne)", out == "en_livraison", out)
    code, out = psql(parler(GERANT1) + "set role lecteur_boutiques; select count(*) from public.colis;")
    verifier("le gérant, lui, ne voit toujours que ses colis", out == "2", out)
    code, out = psql(parler(GERANT1) + "set role lecteur_boutiques; select count(*) from public.boutiques_supervisees;")
    verifier("et ne voit pas le lien (ce n'est pas son affaire)", out == "0", out)
    code, out = psql(parler(AUTRE) + "set role lecteur_boutiques; select count(*) from public.mes_boutiques();")
    verifier("Fatou n'a aucune boutique", out == "0", out)

    print("\nLe bureau retire une boutique")
    code, out = psql(parler(BUREAU) + f"set role lecteur_boutiques; delete from public.boutiques_supervisees where superviseur_id = '{PROPRIO}' and fournisseur_id = '{GERANT2}';")
    verifier("le lien se retire", code == 0, out)
    code, out = psql(parler(PROPRIO) + "set role lecteur_boutiques; select string_agg(numero, ',' order by numero) from public.colis;")
    verifier("et Marcory disparaît aussitôt de sa lecture", out == "G1-A,G1-B,PR-A", out)

    psql(f"drop database if exists {BASE};", base="postgres")
    psql("drop role if exists lecteur_boutiques;", base="postgres")
    print(f"\n{reussies} réussies, {echouees} échouées")
    raise SystemExit(1 if echouees else 0)


if __name__ == "__main__":
    main()
