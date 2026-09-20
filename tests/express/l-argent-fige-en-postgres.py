#!/usr/bin/env python3
"""
CLT EXPRESS — L'ARGENT ET LE STATUT FIGÉS, JOUÉS DANS UN VRAI POSTGRES (20/09/2026, point 20.A)
===========================================================================================
L'inventaire a montré qu'un client pouvait mettre le prix de sa course à zéro, et qu'un coursier
pouvait relever sa part ou effacer la commission avant de marquer « livrée ». Cet essai monte le
décor tel qu'il est en production (tables, ancien trigger de prix, anciennes règles), joue la
migration, puis essaie chaque fraude avec le rôle `authenticated` et un auth.uid() factice.

USAGE
  python3 tests/express/l-argent-fige-en-postgres.py
"""

import os, subprocess, sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIGRATION = os.path.join(RACINE, "_sql-prive", "2026-09-20-express-l-argent-fige.sql")
BASE = "essai_express_fige_clt"

reussies = echouees = 0


def verifier(titre, condition, detail=None):
    global reussies, echouees
    if condition:
        reussies += 1
        print("  ✅ " + titre)
    else:
        echouees += 1
        print("  ❌ " + titre + (("\n       → " + str(detail)[:400]) if detail is not None else ""))


def psql(sql, base=BASE, tuples=True):
    args = ["psql", "-q", "-v", "ON_ERROR_STOP=1", "-d", base]
    if tuples:
        args += ["-At", "-F", "|"]
    r = subprocess.run(["su", "postgres", "-c", " ".join(
        ["'" + a.replace("'", "'\\''") + "'" for a in args])],
        input=sql, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip()


CLIENT   = "11111111-1111-1111-1111-111111111111"
COURSIER = "22222222-2222-2222-2222-222222222222"
COURSIER2 = "23232323-2323-2323-2323-232323232323"
PAUVRE   = "24242424-2424-2424-2424-242424242424"
BUREAU   = "33333333-3333-3333-3333-333333333333"
COURSE   = "aaaaaaaa-0000-0000-0000-000000000001"
COURSE2  = "aaaaaaaa-0000-0000-0000-000000000002"

DECOR = f"""
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if; end $$;
create schema if not exists auth;
create table public.qui_parle (id uuid);
insert into public.qui_parle values (null);
create function auth.uid() returns uuid language sql stable as $$ select id from public.qui_parle limit 1 $$;
create function public.migration_appliquee(nom text, resume text) returns text
  language sql as $$ select 'enregistrée : ' || nom $$;
create table public.profiles (id uuid primary key, role text, status text default 'valide', full_name text, phone text);
insert into public.profiles values
  ('{CLIENT}','client_express','valide','Yao Client','2250700000021'),
  ('{COURSIER}','coursier_express','valide','Ali Coursier','2250700000031'),
  ('{COURSIER2}','coursier_express','valide','Bakary Coursier','2250700000032'),
  ('{PAUVRE}','coursier_express','valide','Sans Solde','2250700000033'),
  ('{BUREAU}','equipe','valide','Le Bureau','2250700000009');
create table public.express_config (id smallint primary key default 1, tarif_base numeric not null default 500,
  tarif_par_km numeric not null default 150, commission_pct numeric not null default 0.15,
  solde_minimum numeric not null default 500, rayon_dispatch_km numeric not null default 3, updated_at timestamptz default now());
insert into public.express_config (id) values (1);
create table public.express_wallets (coursier_id uuid primary key, solde numeric not null default 0);
insert into public.express_wallets values ('{COURSIER}', 5000), ('{COURSIER2}', 5000), ('{PAUVRE}', 0);
create table public.express_courses (
  id uuid primary key default gen_random_uuid(), client_id uuid not null, coursier_id uuid,
  status text not null default 'en_attente', description_colis text, adresse_recuperation text, adresse_livraison text,
  latitude_recuperation double precision, longitude_recuperation double precision,
  latitude_livraison double precision, longitude_livraison double precision,
  destinataire_nom text, destinataire_telephone text,
  distance_km numeric, prix_total numeric, commission_montant numeric, montant_coursier numeric,
  commission_reglee boolean not null default false, photo_colis_path text,
  paiement_mode text, paiement_status text,
  created_at timestamptz not null default now(), accepted_at timestamptz, recuperee_at timestamptz, delivered_at timestamptz, cancelled_at timestamptz);
create function public.express_haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 6371 * 2 * asin(sqrt(sin(radians(lat2-lat1)/2)^2 + cos(radians(lat1))*cos(radians(lat2))*sin(radians(lng2-lng1)/2)^2)) $$;
-- L'ancienne règle de lecture des coursiers, telle qu'en production : toutes les courses en attente.
alter table public.express_courses enable row level security;
alter table public.express_courses force row level security;
create policy "Client voit ses propres courses" on public.express_courses for select to authenticated using (auth.uid() = client_id);
create policy "Client cree ses propres courses" on public.express_courses for insert to authenticated with check (auth.uid() = client_id);
create policy "Client annule sa course en attente" on public.express_courses for update to authenticated
  using (auth.uid() = client_id and status = 'en_attente') with check (auth.uid() = client_id);
create policy "Coursier voit les courses disponibles et les siennes" on public.express_courses for select to authenticated
  using (coursier_id = auth.uid() or (status = 'en_attente' and exists (select 1 from public.profiles where id = auth.uid() and role = 'coursier_express' and status = 'valide')));
create policy "Coursier accepte une course disponible" on public.express_courses for update to authenticated
  using (status = 'en_attente') with check (coursier_id = auth.uid());
create policy "Coursier gere la course qu il a acceptee" on public.express_courses for update to authenticated
  using (coursier_id = auth.uid()) with check (coursier_id = auth.uid());
create policy "Equipe lit tout" on public.express_courses for select to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('equipe','admin')));
create policy "Equipe gere tout" on public.express_courses for update to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('equipe','admin')));
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
-- Les deux fonctions des primes, telles qu'en production : definer, ouvertes à tous.
create table public.primes_parametres (id int primary key, taux numeric);
insert into public.primes_parametres values (1, 0.1);
create function public.primes_parametres_pour(p_periode date) returns public.primes_parametres
  language sql stable security definer as $$ select * from public.primes_parametres limit 1 $$;
create function public.primes_mesures_livreur(p_livreur uuid, p_periode date) returns table (nb int)
  language sql stable security definer as $$ select 42 $$;
create function public.express_courses_proximite(p_lat double precision, p_lng double precision)
  returns table (id uuid) language sql stable security definer as $$ select id from public.express_courses $$;

insert into public.express_courses (id, client_id, status, description_colis, adresse_recuperation, adresse_livraison,
  latitude_recuperation, longitude_recuperation, latitude_livraison, longitude_livraison, destinataire_nom, destinataire_telephone,
  distance_km, prix_total, commission_montant, montant_coursier)
values ('{COURSE}', '{CLIENT}', 'en_attente', 'Un dossier', 'Plateau', 'Cocody', 5.32, -4.02, 5.35, -3.99, 'Mme Koné', '0700000099', 4.5, 1175, 176, 999),
       ('{COURSE2}', '{CLIENT}', 'en_attente', 'Un sac', 'Marcory', 'Treichville', 5.30, -3.99, 5.31, -4.00, 'M. Traoré', '0700000098', 2, 800, 120, 680);

create role testeur_express in role authenticated;
grant usage on schema public, auth to testeur_express;
grant select, insert, update on all tables in schema public to testeur_express;
grant execute on all functions in schema auth to testeur_express;
"""


def parler(qui):
    return f"update public.qui_parle set id = {('null' if qui is None else repr(qui) + '::uuid')};"


def en_tant_que(qui, sql):
    return psql(parler(qui) + " set role testeur_express; " + sql)


def main():
    if not os.path.exists(MIGRATION):
        print("⏭️  migration absente (dossier privé, hors dépôt) : essai sauté.")
        return 0
    subprocess.run(["service", "postgresql", "start"], capture_output=True)
    psql(f"drop database if exists {BASE};", base="postgres")
    psql("drop role if exists testeur_express;", base="postgres")
    code, out = psql(f"create database {BASE};", base="postgres")
    if code != 0:
        print("⏭️  Postgres n'est pas joignable : essai sauté.\n   " + out[:200])
        return 0
    code, out = psql(DECOR)
    if code != 0:
        print("❌ Le décor ne se monte pas :\n" + out[-800:])
        return 1

    print("\n0. AVANT LA MIGRATION : la fraude passe (c'est ce que l'inventaire a trouvé)")
    code, out = en_tant_que(CLIENT, f"update public.express_courses set prix_total = 0 where id = '{COURSE}'; select prix_total from public.express_courses where id = '{COURSE}';")
    verifier("un client met le prix de sa course à 0", code == 0 and out == "0", out)
    psql(f"update public.express_courses set prix_total = 1175 where id = '{COURSE}';")
    code, out = en_tant_que(COURSIER, f"select count(*) from public.express_courses where status = 'en_attente' and destinataire_telephone is not null;")
    verifier("un coursier lit le téléphone des destinataires de toutes les courses en attente", out == "2", out)
    code, out = en_tant_que(None, "select nb from public.primes_mesures_livreur('11111111-1111-1111-1111-111111111111', current_date);")
    verifier("un anonyme lit les mesures de primes d'un livreur", code == 0 and out == "42", out)

    print("\n1. La migration s'applique")
    sql = open(MIGRATION, encoding="utf-8").read()
    code, out = psql(sql)
    verifier("elle passe sans erreur", code == 0, out[-500:])
    code, out = psql(sql)
    verifier("et se rejoue sans erreur", code == 0, out[-300:])
    code, out = psql("select count(*) from pg_trigger where tgname = 'express_courses_figer_argent';")
    verifier("le trigger est posé", out == "1", out)

    print("\n2. L'argent ne bouge plus depuis un téléphone")
    code, out = en_tant_que(CLIENT, f"update public.express_courses set prix_total = 0, commission_montant = 0 where id = '{COURSE}'; select prix_total||'/'||commission_montant from public.express_courses where id = '{COURSE}';")
    verifier("le client qui met le prix à 0 : la ligne garde 1175 / 176", out == "1175/176", out)
    code, out = en_tant_que(COURSIER, f"select count(*) from public.express_courses where status = 'en_attente';")
    verifier("le coursier ne lit plus les courses en attente dans la table", out == "0", out)
    code, out = en_tant_que(COURSIER, f"update public.express_courses set status = 'acceptee', coursier_id = '{COURSIER}' where id = '{COURSE}'; select status from public.express_courses where id = '{COURSE}';")
    verifier("accepter par un update direct ne fait rien (la ligne lui est invisible)", out == "", out)

    print("\n3. Accepter : par la fonction, atomiquement")
    code, out = en_tant_que(PAUVRE, f"select status from public.express_accepter_course('{COURSE}');")
    verifier("un coursier sans solde est refusé : solde_insuffisant", code != 0 and "solde_insuffisant" in out, out[-200:])
    code, out = en_tant_que(COURSIER, f"select status||'/'||coursier_id from public.express_accepter_course('{COURSE}');")
    verifier("le coursier accepte : acceptee, à son nom", out == f"acceptee/{COURSIER}", out)
    code, out = en_tant_que(COURSIER2, f"select status from public.express_accepter_course('{COURSE}');")
    verifier("le second arrive après : deja_prise", code != 0 and "deja_prise" in out, out[-200:])
    code, out = en_tant_que(COURSIER, f"select coalesce(destinataire_telephone,'—') from public.express_courses where id = '{COURSE}';")
    verifier("une fois acceptée, le coursier voit le téléphone du destinataire", out == "0700000099", out)

    print("\n4. Le coursier ne touche ni à sa part, ni à la commission, ni au statut hors chemin")
    code, out = en_tant_que(COURSIER, f"update public.express_courses set montant_coursier = 5000, commission_montant = 0 where id = '{COURSE}'; select montant_coursier||'/'||commission_montant from public.express_courses where id = '{COURSE}';")
    verifier("montant_coursier et commission restent 999 / 176", out == "999/176", out)
    code, out = en_tant_que(COURSIER, f"update public.express_courses set status = 'livree' where id = '{COURSE}';")
    verifier("acceptee → livree directement : refusé (transition_interdite)", code != 0 and "transition_interdite" in out, out[-200:])
    code, out = en_tant_que(COURSIER, f"update public.express_courses set status = 'recuperee' where id = '{COURSE}'; update public.express_courses set status = 'livree' where id = '{COURSE}'; select status from public.express_courses where id = '{COURSE}';")
    verifier("acceptee → recuperee → livree : le chemin du métier passe", out == "livree", out)
    code, out = en_tant_que(COURSIER, f"update public.express_courses set commission_reglee = true, client_id = '{COURSIER}' where id = '{COURSE}'; select commission_reglee::text||'/'||client_id from public.express_courses where id = '{COURSE}';")
    verifier("commission_reglee et client_id sont figés", out == f"false/{CLIENT}", out)

    print("\n5. Le client annule seulement en attente ; le coursier peut rendre")
    code, out = en_tant_que(CLIENT, f"update public.express_courses set status = 'annulee' where id = '{COURSE}'; select status from public.express_courses where id = '{COURSE}';")
    verifier("annuler une course livrée : sans effet, elle reste livrée", out == "livree", out)
    code, out = en_tant_que(COURSIER2, f"select status from public.express_accepter_course('{COURSE2}');")
    code, out = en_tant_que(COURSIER2, f"select status||'/'||coalesce(coursier_id::text,'-') from public.express_rendre_course('{COURSE2}');")
    verifier("le coursier rend une course acceptée : en_attente, sans coursier", out == "en_attente/-", out)
    code, out = en_tant_que(CLIENT, f"update public.express_courses set status = 'annulee' where id = '{COURSE2}'; select status from public.express_courses where id = '{COURSE2}';")
    verifier("le client annule sa course en attente", out == "annulee", out)
    code, out = en_tant_que(BUREAU, f"update public.express_courses set prix_total = 2000 where id = '{COURSE}'; select prix_total from public.express_courses where id = '{COURSE}';")
    verifier("le bureau, lui, corrige un prix", out == "2000", out)

    print("\n6. Chacun voit l'autre partie de sa course")
    code, out = en_tant_que(CLIENT, f"select full_name||'/'||phone from public.profiles where id = '{COURSIER}';")
    verifier("le client lit le nom et le numéro de son coursier", out == "Ali Coursier/2250700000031", out)
    code, out = en_tant_que(COURSIER, f"select full_name from public.profiles where id = '{CLIENT}';")
    verifier("le coursier lit le nom de son client", out == "Yao Client", out)
    code, out = en_tant_que(COURSIER2, f"select count(*) from public.profiles where id = '{CLIENT}';")
    verifier("un coursier qui n'a pas la course ne lit pas le client", out == "0", out)

    print("\n7. La liste des courses disponibles ne dit plus le destinataire")
    psql(f"insert into public.express_courses (client_id, status, adresse_recuperation, adresse_livraison, latitude_recuperation, longitude_recuperation, destinataire_nom, destinataire_telephone, prix_total) values ('{CLIENT}', 'en_attente', 'Plateau', 'Cocody', 5.32, -4.02, 'Secret', '0700000097', 900);")
    code, out = en_tant_que(COURSIER2, "select count(*)||'/'||coalesce(max(destinataire_telephone),'—') from public.express_courses_proximite(5.32, -4.02);")
    verifier("dans le rayon : la course, sans téléphone", out == "1/—", out)
    code, out = en_tant_que(COURSIER2, "select count(*) from public.express_courses_proximite(null, null);")
    verifier("sans position : toutes les courses en attente", out == "1", out)
    code, out = en_tant_que(CLIENT, "select count(*) from public.express_courses_proximite(null, null);")
    verifier("un client n'obtient rien", out == "0", out)

    print("\n7b. À la création, le prix vient du serveur, pas du téléphone")
    code, out = en_tant_que(CLIENT, f"insert into public.express_courses (client_id, status, coursier_id, adresse_recuperation, adresse_livraison, latitude_recuperation, longitude_recuperation, latitude_livraison, longitude_livraison, distance_km, prix_total, commission_montant, montant_coursier) values ('{BUREAU}', 'livree', '{COURSIER}', 'A', 'B', 5.32, -4.02, 5.35, -3.99, 0.01, 1, 0, 1) returning client_id||'/'||status||'/'||coalesce(coursier_id::text,'-')||'/'||coalesce(prix_total::text,'-');")
    verifier("client_id = moi, en_attente, sans coursier, prix recalculé (ou vide si pas de trigger de prix dans ce décor)", out == f"{CLIENT}/en_attente/-/-", out)

    print("\n8. Les fonctions des primes sont fermées")
    code, out = en_tant_que(None, "select nb from public.primes_mesures_livreur('11111111-1111-1111-1111-111111111111', current_date);")
    verifier("un anonyme : permission refusée", code != 0 and "permission" in out.lower(), out[-200:])
    code, out = en_tant_que(CLIENT, "select taux from public.primes_parametres_pour(current_date);")
    verifier("un compte connecté : permission refusée", code != 0 and "permission" in out.lower(), out[-200:])

    psql(f"drop database if exists {BASE};", base="postgres")
    psql("drop role if exists testeur_express;", base="postgres")
    print(f"\n{reussies} réussie(s), {echouees} échouée(s).")
    return 1 if echouees else 0


if __name__ == "__main__":
    sys.exit(main())
