#!/usr/bin/env python3
"""
UNE SEULE RECHERCHE POUR TOUT — JOUÉE DANS UN VRAI POSTGRES — point 7.8, 17 septembre 2026
===========================================================================================
Une recherche qui traverse trois tables et lit par-dessus les règles d'accès : ce qui compte
n'est pas qu'elle trouve, c'est qu'elle ne trouve RIEN pour qui n'a pas à chercher. Elle est
SECURITY DEFINER par nécessité — il faut lire au-delà de ce que voit l'appelant — donc son
premier geste est de refuser quiconque n'est pas du bureau.

Et le cas qui a motivé tout le point : un numéro de téléphone tapé sans espaces doit trouver
un colis enregistré avec des espaces. C'est ce qu'un « contient » ordinaire ne sait pas faire,
et c'est pour cela que cette recherche est en base et non dans l'écran.

USAGE
  python3 tests/recherche/essai-en-postgres.py
"""

import os, subprocess, sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIGRATION = os.path.join(RACINE, "_sql-prive", "2026-09-17-chercher-partout.sql")
BASE = "essai_recherche_clt"

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


ADMIN   = '11111111-1111-1111-1111-111111111111'
EQUIPE  = '22222222-2222-2222-2222-222222222222'
LIVREUR = '33333333-3333-3333-3333-333333333333'
CLIENTE = '44444444-4444-4444-4444-444444444444'

DECOR = f"""
-- Les deux rôles que Supabase fournit : « authenticated » pour un compte connecté, « anon »
-- pour un visiteur. La migration retire explicitement le droit d'exécution à ce dernier.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
end $$;
create schema if not exists auth;
-- Colonnes relevées dans la vraie base le 17/09/2026. Deux fois de suite, un jet écrit de
-- mémoire a inventé une colonne (destinataire_nom sur colis, boutique sur profiles) — et deux
-- fois, le décor écrit de la même mémoire a confirmé l'erreur. Un décor d'essai n'est utile
-- que s'il vient du schéma.
create table public.profiles (id uuid primary key, role text, full_name text, company_name text,
  phone text, created_at timestamptz default now(), commune_recuperation text,
  adresse_recuperation text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('essai.uid', true), '')::uuid $$;
create function public.is_admin() returns boolean language sql stable security definer as
  $$ select exists (select 1 from public.profiles where id = auth.uid() and role='admin') $$;
create function public.is_equipe() returns boolean language sql stable security definer as
  $$ select exists (select 1 from public.profiles where id = auth.uid() and role='equipe') $$;
create function public.migration_appliquee(nom text, resume text) returns text
  language sql as $$ select 'enregistrée : ' || nom $$;

-- LES COLONNES SONT CELLES DE LA VRAIE TABLE, relevées en base le 17/09/2026 — pas écrites
-- de mémoire. Un premier jet avait inventé un « destinataire_nom » sur colis (il n'existe que
-- sur les courses Express) ; comme ce décor-ci l'avait inventé aussi, l'essai passait au vert
-- et la fonction tombait en production. Un décor d'essai se copie sur le schéma, toujours.
create table public.colis (
  id uuid primary key default gen_random_uuid(), numero text, description text,
  destination text, commune_destination text, destinataire_telephone text, livreur_nom text,
  created_at timestamptz default now());
create table public.express_courses (
  id uuid primary key default gen_random_uuid(), status text,
  adresse_recuperation text, adresse_livraison text, destinataire_nom text,
  destinataire_telephone text, created_at timestamptz default now());

insert into public.profiles (id, full_name, phone, role, company_name, commune_recuperation) values
  ('{ADMIN}',   'Le Gérant',  '+225 07 79 60 47 61', 'admin',       null,           null),
  ('{EQUIPE}',  'Bureau CLT', '0170407312',          'equipe',      null,           null),
  ('{LIVREUR}', 'Kasimir',    '07 00 00 00 01',      'livreur',     null,           null),
  ('{CLIENTE}', 'Awa Koné',   '05 46 81 86 40',      'fournisseur', 'Awa Boutique', 'Yopougon');

-- LE CAS QUI A MOTIVÉ LE POINT : le même numéro, écrit de trois façons.
insert into public.colis (numero, description, destination, commune_destination, destinataire_telephone) values
  ('CLT-260917-00001', 'Deux paires de chaussures', 'Riviera 2', 'Cocody', '07 01 02 03 04'),
  ('CLT-260917-00002', 'Un carton pour Kouamé',     'Angré',     'Cocody', '0701020304'),
  ('CLT-260917-00003', 'Sac',                       'Yopougon',  'Yopougon', null);
insert into public.express_courses (status, adresse_recuperation, adresse_livraison, destinataire_nom, destinataire_telephone)
  values ('livree', 'Plateau', 'Marcory', 'Kouamé Express', '+225 07 01 02 03 04');
"""


def comme(uid, sql):
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

    print("\n1. La fonction se pose")
    code, s = psql(open(MIGRATION, encoding="utf-8").read())
    verifier("elle passe sans erreur", code == 0, s[-400:])

    print("\n2. LE CAS QUI A MOTIVÉ LE POINT : un téléphone, quelle que soit son écriture")
    # Les cinq écritures qu'on rencontre vraiment : sans séparateur, avec espaces, avec tirets,
    # avec l'indicatif, et avec l'indicatif collé. Le dernier cas a été mesuré en production :
    # « +225 07 98 54 66 62 » ne trouvait rien tant qu'on comparait les chiffres entiers.
    for tape in ['0701020304', '07 01 02 03 04', '07-01-02-03-04', '+225 07 01 02 03 04', '2250701020304']:
        code, s = comme(EQUIPE, f"select count(*) from public.chercher_partout('{tape}') where famille='colis';")
        verifier(f"« {tape} » trouve LES DEUX colis, écrits différemment", s == "2", s)
    code, s = comme(EQUIPE, "select titre from public.chercher_partout('0701020304') where famille='colis' order by titre;")
    verifier("et ce sont bien les bons", s == "CLT-260917-00001\nCLT-260917-00002", s)
    code, s = comme(EQUIPE, "select count(*) from public.chercher_partout('070');")
    verifier("trois chiffres seulement ne déclenchent pas la recherche par numéro", s == "0", s)

    print("\n3. Elle trouve aussi par nom, par adresse et par numéro de colis")
    for terme, famille, attendu in [('Kouamé', 'colis', 1), ('Riviera', 'colis', 1), ('00002', 'colis', 1),
                                    ('Awa', 'personne', 1), ('Boutique', 'personne', 1), ('Kasimir', 'personne', 1)]:
        code, s = comme(EQUIPE, f"select count(*) from public.chercher_partout('{terme}') where famille='{famille}';")
        verifier(f"« {terme} » → {attendu} {famille}", s == str(attendu), s)
    code, s = comme(EQUIPE, "select detail from public.chercher_partout('Riviera') where famille='colis';")
    verifier("un colis dit où il va et ce que c'est", 'Cocody — Riviera 2' in s and 'chaussures' in s, s)

    print("\n4. CE QU'ELLE REFUSE : qui n'est pas du bureau ne cherche rien")
    for uid, qui in [(LIVREUR, 'un livreur'), (CLIENTE, 'une cliente')]:
        code, s = comme(uid, "select count(*) from public.chercher_partout('Kouamé');")
        verifier(f"{qui} n'obtient AUCUNE ligne", s == "0", s)
    code, s = psql("set role authenticated; select count(*) from public.chercher_partout('Kouamé'); reset role;")
    verifier("un compte sans identité non plus", s == "0", s)
    code, s = psql("select has_function_privilege('anon', 'public.chercher_partout(text,integer)', 'execute');")
    verifier("elle n'est pas exécutable par un visiteur anonyme", s in ('f', ''), s)

    print("\n5. Express n'est ouvert qu'à l'administration")
    code, s = comme(ADMIN, "select count(*) from public.chercher_partout('Kouamé') where famille='course';")
    verifier("l'administration voit la course", s == "1", s)
    code, s = comme(EQUIPE, "select count(*) from public.chercher_partout('Kouamé') where famille='course';")
    verifier("l'équipe ne la voit pas : elle n'a pas l'onglet non plus", s == "0", s)
    code, s = comme(EQUIPE, "select count(*) from public.chercher_partout('Kouamé');")
    verifier("mais elle trouve quand même le colis du même nom", s == "1", s)

    print("\n6. Ce qu'elle ne touche pas, et ce qu'elle refuse de faire")
    code, s = psql("select pg_get_functiondef('public.chercher_partout(text,integer)'::regprocedure);")
    argent = ['gestion_recettes', 'gestion_depenses', 'gestion_bulletins', 'gestion_caisse',
              'montant', 'remises_caisse', 'reversements_clientes']
    verifier("aucune table ni colonne d'argent n'est lue", not any(m in s for m in argent),
             [m for m in argent if m in s])
    code, s = comme(EQUIPE, "select count(*) from public.chercher_partout('ab');")
    verifier("moins de trois caractères : aucune ligne, pas une erreur", code == 0 and s == "0", s)
    code, s = comme(EQUIPE, "select count(*) from public.chercher_partout(null);")
    verifier("un terme vide ne casse rien", code == 0 and s == "0", s)
    # Une apostrophe et un signe pour cent : ni injection, ni joker involontaire.
    code, s = comme(EQUIPE, "select count(*) from public.chercher_partout('%');")
    verifier("un « % » ne ramène pas toute la base", code == 0 and s == "0", s)
    code, s = comme(EQUIPE, "select count(*) from public.chercher_partout('O''Brien');")
    verifier("une apostrophe ne casse rien", code == 0, s[-200:])
    code, s = comme(EQUIPE, "select count(*) from public.chercher_partout('Kouamé', 1) where famille='colis';")
    verifier("la limite par famille est respectée", s == "1", s)
    code, s = comme(EQUIPE, "select count(*) from public.chercher_partout('Kouamé', 9999) where famille='colis';")
    verifier("et elle est bornée : on ne peut pas demander la base entière", code == 0 and s == "1", s)

    psql(f"drop database if exists {BASE};", base="postgres")
    print(f"\n{reussies} réussie(s), {echouees} échouée(s).")
    return 1 if echouees else 0


if __name__ == "__main__":
    sys.exit(main())
