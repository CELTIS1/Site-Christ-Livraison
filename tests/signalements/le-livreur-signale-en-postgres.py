#!/usr/bin/env python3
"""
LE LIVREUR SIGNALE UN PROBLÈME, JOUÉ DANS UN VRAI POSTGRES (20/09/2026, point 20.C)
===========================================================================================
La table des signalements accueille désormais ceux du livreur (auteur = 'livreur'). Cet essai
monte le décor du 17/09 (table + règles de la cliente), joue la migration, et vérifie que :
  • le livreur ouvre un signalement sur SON colis, ou sans colis — pas sur le colis d'un autre,
    pas au nom d'une cliente, pas en se faisant passer pour une cliente ;
  • il lit les siens et rien d'autre ; la cliente ne voit pas ceux du livreur ;
  • l'équipe voit tout, et essentiel_compteurs() compte « dont livreurs ».

USAGE
  python3 tests/signalements/le-livreur-signale-en-postgres.py
"""
import json, os, subprocess, sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIGRATION = os.path.join(RACINE, "_sql-prive", "2026-09-20-le-livreur-signale.sql")
MIGRATION_AVANT = os.path.join(RACINE, "_sql-prive", "2026-09-20-le-centre-a-traiter.sql")
BASE = "essai_signalements_clt"
reussies = echouees = 0


def verifier(titre, condition, detail=None):
    global reussies, echouees
    if condition:
        reussies += 1; print("  ✅ " + titre)
    else:
        echouees += 1; print("  ❌ " + titre + (("\n       → " + str(detail)[:400]) if detail is not None else ""))


def psql(sql, base=BASE):
    r = subprocess.run(["su", "postgres", "-c", "psql -q -v ON_ERROR_STOP=1 -At -F '|' -d " + base],
                       input=sql, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip()


BUREAU = "33333333-3333-3333-3333-333333333333"
LIVREUR = "11111111-1111-1111-1111-111111111111"
AUTRE_LIVREUR = "22222222-2222-2222-2222-222222222222"
CLIENTE = "44444444-4444-4444-4444-444444444444"
COLIS_A_MOI = "aaaaaaaa-0000-0000-0000-000000000001"
COLIS_A_L_AUTRE = "aaaaaaaa-0000-0000-0000-000000000002"

DECOR = f"""
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if; end $$;
create schema if not exists auth;
create table public.qui_parle (id uuid); insert into public.qui_parle values (null);
create function auth.uid() returns uuid language sql stable as $$ select id from public.qui_parle limit 1 $$;
create function public.migration_appliquee(nom text, resume text) returns text language sql as $$ select nom $$;
create table public.profiles (id uuid primary key, role text, status text default 'valide', suppression_demandee_at timestamptz);
insert into public.profiles (id, role) values ('{BUREAU}','equipe'), ('{LIVREUR}','livreur'), ('{AUTRE_LIVREUR}','livreur'), ('{CLIENTE}','fournisseur');
create function public.is_equipe() returns boolean language sql stable security definer as
  $$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('equipe', 'admin')) $$;
create table public.colis (
  id uuid primary key default gen_random_uuid(), numero text, statut text, fournisseur_id uuid, livreur_id uuid, livreur_collecte_id uuid,
  montant numeric, montant_article numeric, montant_livraison numeric, article_non_encaisse boolean, reverse_au_fournisseur_at timestamptz,
  encaissement_remis boolean, reporte_au date, created_at timestamptz default now(), non_livre_at timestamptz, retour_at timestamptz,
  retour_detenteur text, retour_rendu_at timestamptz, echec_imputable boolean, frais_additionnels_montant numeric, frais_additionnels_regle_at timestamptz);
alter table public.colis enable row level security;
create policy colis_tous on public.colis for select using (true);
insert into public.colis (id, numero, statut, fournisseur_id, livreur_id) values
  ('{COLIS_A_MOI}', 'C-1', 'en_livraison', '{CLIENTE}', '{LIVREUR}'),
  ('{COLIS_A_L_AUTRE}', 'C-2', 'en_livraison', '{CLIENTE}', '{AUTRE_LIVREUR}');
-- La table du 17/09, telle qu'elle est en production, avec ses trois règles.
create table public.reclamations_clientes (
  id uuid primary key default gen_random_uuid(),
  fournisseur_id uuid not null references public.profiles(id) on delete cascade,
  colis_id uuid references public.colis(id) on delete set null,
  motif text not null, texte text, statut text not null default 'ouverte',
  created_at timestamptz not null default now(), traitee_at timestamptz, traitee_par uuid references public.profiles(id), reponse text,
  constraint reclamations_clientes_statut_valide check (statut in ('ouverte','en_cours','resolue')));
alter table public.reclamations_clientes enable row level security;
create policy reclamations_clientes_cliente_lit on public.reclamations_clientes for select using (fournisseur_id = auth.uid() or public.is_equipe());
create policy reclamations_clientes_cliente_ouvre on public.reclamations_clientes for insert with check (fournisseur_id = auth.uid() or public.is_equipe());
create policy reclamations_clientes_equipe_traite on public.reclamations_clientes for update using (public.is_equipe()) with check (public.is_equipe());
insert into public.reclamations_clientes (fournisseur_id, colis_id, motif) values ('{CLIENTE}', '{COLIS_A_MOI}', 'retard');
create table public.demandes_de_passage (id uuid primary key default gen_random_uuid(), jour date, fournisseur_id uuid, statut text default 'en_attente'
  check (statut in ('en_attente','traitee','annulee')), motif text);
grant usage on schema public, auth to authenticated;
grant select, insert, update on public.reclamations_clientes to authenticated;
grant select on public.colis, public.profiles to authenticated;
create role testeur_sg in role authenticated; grant usage on schema public, auth to testeur_sg; grant select, update on public.qui_parle to testeur_sg;
"""


def parler(qui):
    return f"update public.qui_parle set id = {('null' if qui is None else repr(qui) + '::uuid')};"


def main():
    if not os.path.exists(MIGRATION) or not os.path.exists(MIGRATION_AVANT):
        print("⏭️  migration absente (dossier privé, hors dépôt) : essai sauté."); return 0
    subprocess.run(["service", "postgresql", "start"], capture_output=True)
    psql(f"drop database if exists {BASE};", base="postgres"); psql("drop role if exists testeur_sg;", base="postgres")
    code, out = psql(f"create database {BASE};", base="postgres")
    if code != 0:
        print("⏭️  Postgres n'est pas joignable : essai sauté.\n   " + out[:200]); return 0
    code, out = psql(DECOR)
    if code != 0:
        print("❌ Le décor ne se monte pas :\n" + out[-800:]); return 1

    print("\n1. Les migrations")
    code, out = psql(open(MIGRATION_AVANT, encoding="utf-8").read()); verifier("celle du 20.B passe (essentiel_compteurs)", code == 0, out[-400:])
    sql = open(MIGRATION, encoding="utf-8").read()
    code, out = psql(sql); verifier("celle du livreur passe", code == 0, out[-500:])
    code, out = psql(sql); verifier("elle se rejoue", code == 0, out[-300:])
    code, out = psql("select auteur, fournisseur_id is not null from public.reclamations_clientes;")
    verifier("le signalement existant de la cliente est marqué « cliente », intact", out == "cliente|t", out)

    print("\n2. Le livreur ouvre les siens — et seulement les siens")
    moi = parler(LIVREUR) + " set role testeur_sg; "
    code, out = psql(moi + f"insert into public.reclamations_clientes (auteur, livreur_id, colis_id, motif, texte) values ('livreur', '{LIVREUR}', '{COLIS_A_MOI}', 'maj_non_enregistree', 'Livré, refusé par le serveur') returning statut;")
    verifier("sur son colis : accepté, ouvert", code == 0 and out == "ouverte", out[-200:])
    code, out = psql(moi + f"insert into public.reclamations_clientes (auteur, livreur_id, motif, texte) values ('livreur', '{LIVREUR}', 'argent', 'Il me manque 2 000 F') returning statut;")
    verifier("sans colis (problème d'argent) : accepté", code == 0 and out == "ouverte", out[-200:])
    code, out = psql(moi + f"insert into public.reclamations_clientes (auteur, livreur_id, colis_id, motif) values ('livreur', '{LIVREUR}', '{COLIS_A_L_AUTRE}', 'autre');")
    verifier("sur le colis d'un autre livreur : refusé", code != 0, out[-200:])
    code, out = psql(moi + f"insert into public.reclamations_clientes (auteur, livreur_id, motif) values ('livreur', '{AUTRE_LIVREUR}', 'autre');")
    verifier("au nom d'un autre livreur : refusé", code != 0, out[-200:])
    code, out = psql(moi + f"insert into public.reclamations_clientes (auteur, fournisseur_id, motif) values ('cliente', '{CLIENTE}', 'autre');")
    verifier("en se faisant passer pour une cliente : refusé", code != 0, out[-200:])
    code, out = psql(moi + f"insert into public.reclamations_clientes (auteur, livreur_id, fournisseur_id, motif) values ('livreur', '{LIVREUR}', '{CLIENTE}', 'autre');")
    verifier("un signalement de livreur qui porterait une cliente : refusé", code != 0, out[-200:])
    code, out = psql(parler(CLIENTE) + f" set role testeur_sg; insert into public.reclamations_clientes (auteur, livreur_id, motif) values ('livreur', '{LIVREUR}', 'autre');")
    verifier("une cliente ne peut pas signer « livreur »", code != 0, out[-200:])
    code, out = psql(parler(BUREAU) + " set role testeur_sg; insert into public.reclamations_clientes (auteur, motif) values ('livreur', 'autre');")
    verifier("sans auteur valide (livreur sans livreur_id) : la contrainte refuse", code != 0, out[-200:])

    print("\n3. Chacun lit ce qui le concerne")
    code, out = psql(moi + "select count(*) from public.reclamations_clientes;")
    verifier("le livreur voit ses 2 signalements, pas celui de la cliente", out == "2", out)
    code, out = psql(parler(CLIENTE) + " set role testeur_sg; select count(*), string_agg(auteur, ',') from public.reclamations_clientes;")
    verifier("la cliente voit le sien seulement — pas ceux du livreur (même sur son colis)", out == "1|cliente", out)
    code, out = psql(parler(BUREAU) + " set role testeur_sg; select count(*) from public.reclamations_clientes;")
    verifier("l'équipe voit les 3", out == "3", out)
    code, out = psql(moi + f"update public.reclamations_clientes set statut = 'resolue' where livreur_id = '{LIVREUR}' returning 1;")
    verifier("le livreur ne clôt pas lui-même (aucune ligne touchée)", out == "", out[-200:])
    code, out = psql(parler(BUREAU) + f" set role testeur_sg; update public.reclamations_clientes set statut = 'resolue', reponse = 'Corrigé à la main' where livreur_id = '{LIVREUR}' and motif = 'argent' returning statut;")
    verifier("l'équipe clôt un signalement de livreur", out == "resolue", out[-200:])
    code, out = psql(moi + "select reponse from public.reclamations_clientes where motif = 'argent';")
    verifier("le livreur lit la réponse du bureau", out == "Corrigé à la main", out)

    print("\n4. L'essentiel compte « dont livreurs »")
    code, out = psql(parler(BUREAU) + " set role testeur_sg; select public.essentiel_compteurs()::text;")
    try:
        r = json.loads(out)
    except Exception:
        r = {}
    verifier("2 signalements ouverts, dont 1 de livreur", r.get('reclamations') == 2 and r.get('reclamations_livreurs') == 1, str(r.get('reclamations')) + '/' + str(r.get('reclamations_livreurs')))

    psql(f"drop database if exists {BASE};", base="postgres"); psql("drop role if exists testeur_sg;", base="postgres")
    print(f"\n———\n{reussies} vérifications réussies, {echouees} échouées")
    return 1 if echouees else 0


if __name__ == "__main__":
    sys.exit(main())
