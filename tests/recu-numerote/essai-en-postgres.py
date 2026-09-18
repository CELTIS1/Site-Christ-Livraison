#!/usr/bin/env python3
"""
UN REÇU NUMÉROTÉ — JOUÉ DANS UN VRAI POSTGRES — 18 septembre 2026 (feuille de route 10.3)
===========================================================================================
Le reçu de reversement existe depuis le 05/09 ; il lui manquait un numéro. Sans numéro, une
vendeuse ne peut pas citer une remise au téléphone et le comptable ne peut pas la rapprocher.

LA PROMESSE QUI COMPTE : la suite n'a pas de trou. C'est pour cela que le numéro ne sort PAS
d'une séquence Postgres — une séquence est consommée même par une transaction qui échoue, et
c'est exactement ce qui a rendu illisible la suite des numéros de colis du 17 septembre.

Le décor est COPIÉ du vrai schéma (relevé en base le 18/09/2026), pas écrit de mémoire.

USAGE
  python3 tests/recu-numerote/essai-en-postgres.py
"""

import os, subprocess

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIGRATION = os.path.join(RACINE, "_sql-prive", "2026-09-18-un-recu-numerote.sql")
BASE = "essai_recu_numerote_clt"

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


COMPTA = '11111111-1111-1111-1111-111111111111'
CLIENTE = '22222222-2222-2222-2222-222222222222'
CLIENTE2 = '33333333-3333-3333-3333-333333333333'

DECOR = f"""
create schema if not exists auth;
create table public.profiles (id uuid primary key, full_name text, role text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('essai.uid', true), '')::uuid $$;
create function public.migration_appliquee(nom text, resume text) returns text
  language sql as $$ select 'enregistrée : ' || nom $$;
create function public.a_acces_compta() returns boolean language sql stable as
  $$ select coalesce(current_setting('essai.compta', true), 'true') = 'true' $$;
create table public.activity_log (
  id bigserial primary key, actor_id uuid, actor_role text, action text,
  target_id uuid, target_type text, details jsonb, created_at timestamptz default now());
create table public.colis (
  id uuid primary key default gen_random_uuid(), numero text, statut text,
  fournisseur_id uuid, montant_article numeric, montant_livraison numeric,
  commune_destination text, article_non_encaisse boolean default false,
  reverse_au_fournisseur_at timestamptz);
-- La table du 05/09/2026, colonnes exactes.
create table public.reversements_clientes (
  id             uuid primary key default gen_random_uuid(),
  fournisseur_id uuid not null references public.profiles(id) on delete restrict,
  montant        numeric not null check (montant >= 0),
  nb_colis       integer not null check (nb_colis > 0),
  colis_ids      uuid[] not null,
  mode           text not null default 'especes',
  note           text,
  fait_par       uuid not null default auth.uid() references public.profiles(id),
  fait_le        timestamptz not null default now(),
  annule_le      timestamptz,
  annule_par     uuid references public.profiles(id),
  annule_motif   text);
insert into public.profiles values
  ('{COMPTA}', 'Comptable CLT', 'admin'),
  ('{CLIENTE}', 'Awa Boutique', 'fournisseur'),
  ('{CLIENTE2}', 'Mariam Mode', 'fournisseur');
-- Trois reçus déjà écrits, dans le désordre des identifiants mais pas des dates : le rattrapage
-- doit les numéroter dans l'ordre où l'argent a été remis, pas dans celui de la table.
insert into public.reversements_clientes (fournisseur_id, montant, nb_colis, colis_ids, fait_par, fait_le)
values ('{CLIENTE}',  30000, 2, array[]::uuid[], '{COMPTA}', '2026-09-10 11:00:00+00'),
       ('{CLIENTE2}', 12000, 1, array[]::uuid[], '{COMPTA}', '2026-09-08 09:00:00+00'),
       ('{CLIENTE}',   5000, 1, array[]::uuid[], '{COMPTA}', '2026-09-15 16:00:00+00');
"""

# Trois colis livrés, non reversés, chez Awa.
COLIS = f"""
insert into public.colis (numero, statut, fournisseur_id, montant_article, montant_livraison, commune_destination)
values ('CLT-A', 'livre', '{CLIENTE}', 20000, 1500, 'Cocody'),
       ('CLT-B', 'livre', '{CLIENTE}', 15000, 1500, 'Yopougon'),
       ('CLT-C', 'livre', '{CLIENTE}',  8000, 1000, 'Abobo');
"""


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
    # La fonction du 05/09, telle qu'elle est en production, avant la migration du 18.
    source = open(os.path.join(RACINE, "_sql-prive", "2026-09-05-reverser-a-la-cliente.sql"),
                  encoding="utf-8").read()
    debut = source.index("create or replace function public.reverser_a_la_cliente")
    fin = source.index("$$;", source.index("return v_id;")) + 3
    code, s = psql(source[debut:fin])
    if code != 0:
        print("⏭️  La fonction du 05/09 n'a pas pu être posée dans le décor :\n   " + s[-300:])
        return 0
    psql(COLIS)

    print("\n1. La migration passe, et se rejoue sans rien casser")
    migration = open(MIGRATION, encoding="utf-8").read()
    code, s = psql(migration)
    verifier("elle passe sans erreur sur une base déjà en service", code == 0, s[-400:])
    code, s = psql(migration)
    verifier("elle se rejoue sans erreur", code == 0, s[-400:])

    print("\n2. Les reçus déjà écrits sont numérotés dans l'ordre de l'argent remis")
    code, s = psql("""select string_agg(numero || '=' || montant::text, ' ' order by numero)
                        from public.reversements_clientes;""")
    verifier("trois reçus, numérotés 1, 2, 3 dans l'ordre des dates (12 000 le 08, 30 000 le 10, 5 000 le 15)",
             s == "REV-2026-0001=12000 REV-2026-0002=30000 REV-2026-0003=5000", s)
    code, s = psql("select count(*) from public.reversements_clientes where numero is null;")
    verifier("aucun reçu ne reste sans numéro", s == "0", s)
    code, s = psql("""select count(*) from pg_indexes where tablename='reversements_clientes'
                       and indexname='reversements_clientes_numero_unique';""")
    verifier("le numéro est unique, garanti par la base", s == "1", s)

    print("\n3. Un nouveau reversement prend le numéro suivant")
    code, s = psql(f"""set essai.uid = '{COMPTA}';
        select public.reverser_a_la_cliente(array(select id from public.colis where numero='CLT-A'));""")
    verifier("le reversement passe", code == 0, s[-300:])
    code, s = psql("select numero from public.reversements_clientes order by fait_le desc limit 1;")
    verifier("il porte REV-2026-0004", s == "REV-2026-0004", s)
    code, s = psql("select details->>'numero' from public.activity_log where action='reversement_cliente';")
    verifier("et le journal le cite, pour qu'on retrouve la pièce depuis l'historique", s == "REV-2026-0004", s)

    print("\n4. LE POINT LE PLUS IMPORTANT : un échec ne consomme aucun numéro")
    # Un colis déjà reversé : la fonction refuse. Avec une séquence, le numéro serait perdu.
    code, s = psql(f"""set essai.uid = '{COMPTA}';
        select public.reverser_a_la_cliente(array(select id from public.colis where numero='CLT-A'));""")
    verifier("un reversement sur un colis déjà soldé est refusé", code != 0, s[-200:])
    code, s = psql(f"""set essai.uid = '{COMPTA}'; set essai.compta = 'false';
        select public.reverser_a_la_cliente(array(select id from public.colis where numero='CLT-B'));""")
    verifier("un reversement sans l'accès comptabilité est refusé", code != 0, s[-200:])
    code, s = psql(f"""set essai.uid = '{COMPTA}';
        select public.reverser_a_la_cliente(array(select id from public.colis where numero='CLT-B'));""")
    verifier("le reversement suivant passe", code == 0, s[-300:])
    code, s = psql("select numero from public.reversements_clientes order by fait_le desc limit 1;")
    verifier("il porte REV-2026-0005, et non 0007 : les deux échecs n'ont rien consommé",
             s == "REV-2026-0005", s)
    code, s = psql("""select string_agg(numero, ' ' order by numero) from public.reversements_clientes;""")
    verifier("la suite est continue, sans trou, de 0001 à 0005",
             s == "REV-2026-0001 REV-2026-0002 REV-2026-0003 REV-2026-0004 REV-2026-0005", s)

    print("\n5. Un reçu annulé garde son numéro, et il n'est jamais réutilisé")
    source_annul = source[source.index("create or replace function public.annuler_reversement"):]
    source_annul = source_annul[:source_annul.index("$$;") + 3]
    psql(source_annul)
    code, s = psql(f"""set essai.uid = '{COMPTA}';
        select public.annuler_reversement((select id from public.reversements_clientes where numero='REV-2026-0005'));""")
    verifier("l'annulation passe", code == 0, s[-300:])
    code, s = psql("select numero, (annule_le is not null)::text from public.reversements_clientes where numero='REV-2026-0005';")
    verifier("le reçu garde son numéro et porte sa date d'annulation", s == "REV-2026-0005|true", s)
    code, s = psql(f"""set essai.uid = '{COMPTA}';
        select public.reverser_a_la_cliente(array(select id from public.colis where numero='CLT-B'));""")
    verifier("le colis libéré peut être reversé de nouveau", code == 0, s[-300:])
    code, s = psql("select numero from public.reversements_clientes order by fait_le desc limit 1;")
    verifier("le nouveau reçu prend 0006 : le numéro annulé n'est pas recyclé", s == "REV-2026-0006", s)

    print("\n6. La numérotation repart à 0001 l'année suivante")
    code, s = psql("select public.numero_reversement_suivant('2027-01-04 10:00:00+00'::timestamptz);")
    verifier("un reversement de 2027 s'appellerait REV-2027-0001", s == "REV-2027-0001", s)
    code, s = psql("select public.numero_reversement_suivant();")
    verifier("et un de cette année, REV-2026-0007", s == "REV-2026-0007", s)

    print("\n7. Qui peut appeler quoi")
    code, s = psql("""select has_function_privilege('authenticated',
                        'public.numero_reversement_suivant(timestamptz)', 'execute')::text;""")
    verifier("le numéroteur n'est pas ouvert aux comptes connectés : il n'est appelé que par la fonction de reversement",
             s == "false", s)

    print(f"\n{reussies} réussie(s), {echouees} échouée(s).")
    return 1 if echouees else 0


if __name__ == "__main__":
    raise SystemExit(main())
