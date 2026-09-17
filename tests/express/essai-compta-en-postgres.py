#!/usr/bin/env python3
"""
L'ARGENT D'EXPRESS EN COMPTABILITÉ, JOUÉ DANS UN VRAI POSTGRES — point 8.5, 17/09/2026
===========================================================================================
Ces vues comptent de l'argent : une erreur d'un mot y est invisible et coûteuse. Le premier
jet, écrit avec les statuts anglais ('delivered', 'validated') alors que la base les écrit en
français, renvoyait ZÉRO partout sans jamais se plaindre — des comptes faux qui ont l'air
justes. D'où cet essai, qui fabrique une situation dont on connaît la réponse à la main.

LA RÈGLE QU'ON VÉRIFIE SURTOUT : la recette de CLT, c'est la COMMISSION. Le prix de la course
est encaissé en espèces par le coursier et ne passe jamais par CLT ; la recharge est une
avance du coursier, pas un produit. Confondre les trois gonflerait le résultat de la société.

USAGE
  python3 tests/express/essai-compta-en-postgres.py
"""

import os, subprocess, sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIGRATION = os.path.join(RACINE, "_sql-prive", "2026-09-17-express-en-comptabilite.sql")
BASE = "essai_express_clt"

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


# Un mois dont on connaît les comptes de tête.
#   Course A : livrée, 2 000 F au client, 300 F de commission, DÉJÀ prélevée
#   Course B : livrée, 1 000 F au client, 150 F de commission, PAS prélevée
#   Course C : annulée (ni prix ni commission)
#   Course D : en chemin (récupérée) — rien n'est dû tant qu'elle n'est pas livrée
#   Recharges : 5 000 F validée, 2 000 F en attente, 9 999 F refusée (ne compte nulle part)
#   Portefeuille du coursier : 4 700 F (5 000 rechargés − 300 prélevés)
DECOR = """
-- Le rôle que Supabase fournit et sur lequel porte le « grant select » de la migration.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;
create schema if not exists auth;
create table public.profiles (id uuid primary key, full_name text, role text, acces_compta boolean default false);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('essai.uid', true), '')::uuid $$;
create function public.a_acces_paie() returns boolean language sql stable as $$ select false $$;
create function public.a_acces_compta() returns boolean language sql stable as
  $$ select exists (select 1 from public.profiles
       where id = auth.uid() and (role = 'admin' or acces_compta = true)) $$;
create function public.a_acces_gestion() returns boolean language sql stable as
  $$ select public.a_acces_paie() or public.a_acces_compta() $$;
create function public.migration_appliquee(nom text, resume text) returns text
  language sql as $$ select 'enregistrée : ' || nom $$;

create table public.express_courses (
  id uuid primary key default gen_random_uuid(), client_id uuid, coursier_id uuid,
  status text, prix_total numeric, commission_montant numeric,
  commission_reglee boolean default false, created_at timestamptz);
create table public.express_recharges (
  id uuid primary key default gen_random_uuid(), coursier_id uuid, montant numeric,
  status text, created_at timestamptz);
create table public.express_wallets (coursier_id uuid primary key, solde numeric, updated_at timestamptz default now());

insert into public.profiles values
  ('11111111-1111-1111-1111-111111111111', 'Gérance', 'admin', true),
  ('22222222-2222-2222-2222-222222222222', 'Coursier Ibrahim', 'express_coursier', false),
  ('33333333-3333-3333-3333-333333333333', 'Cliente Awa', 'fournisseur', false),
  -- Celui-là n'a JAMAIS rechargé : aucune ligne dans express_wallets. Il doit quand même
  -- 90 F de commission. C'est le cas qui faisait disparaître de l'argent en production.
  ('44444444-4444-4444-4444-444444444444', 'Coursier Salif', 'express_coursier', false);

insert into public.express_courses (coursier_id, status, prix_total, commission_montant, commission_reglee, created_at) values
  ('22222222-2222-2222-2222-222222222222', 'livree',    2000, 300, true,  '2026-09-05 10:00+00'),
  ('22222222-2222-2222-2222-222222222222', 'livree',    1000, 150, false, '2026-09-06 10:00+00'),
  ('22222222-2222-2222-2222-222222222222', 'annulee',   null, null, false,'2026-09-07 10:00+00'),
  ('22222222-2222-2222-2222-222222222222', 'recuperee', 1500, 225, false, '2026-09-08 10:00+00'),
  ('44444444-4444-4444-4444-444444444444', 'livree',     600,  90, false, '2026-09-08 11:00+00'),
  -- Un mois plus tôt, pour vérifier que les mois ne se mélangent pas.
  ('22222222-2222-2222-2222-222222222222', 'livree',     500,  75, true,  '2026-08-20 10:00+00');

insert into public.express_recharges (coursier_id, montant, status, created_at) values
  ('22222222-2222-2222-2222-222222222222', 5000, 'validee',    '2026-09-01 08:00+00'),
  ('22222222-2222-2222-2222-222222222222', 2000, 'en_attente', '2026-09-09 08:00+00'),
  ('22222222-2222-2222-2222-222222222222', 9999, 'refusee',    '2026-09-09 09:00+00');

insert into public.express_wallets values ('22222222-2222-2222-2222-222222222222', 4700);
"""

GERANCE = "set essai.uid = '11111111-1111-1111-1111-111111111111';"
COURSIER = "set essai.uid = '22222222-2222-2222-2222-222222222222';"
CLIENTE = "set essai.uid = '33333333-3333-3333-3333-333333333333';"


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
    print("\n1. La migration se joue")
    code, sortie = psql(open(MIGRATION, encoding="utf-8").read())
    verifier("elle passe sans erreur", code == 0, sortie[-400:])

    print("\n2. Le mois de septembre, dont on connaît les comptes de tête")
    champs = ("courses_livrees, courses_annulees, courses_en_cours, courses_encaissees_par_coursiers, "
              "commission_due, commission_prelevee, commission_a_prelever, recharges_encaissees, recharges_en_attente")
    code, ligne = psql(GERANCE + f" select {champs} from public.express_compta_mois where mois = '2026-09-01';")
    attendu = "3|1|1|3600|540|300|240|5000|2000"
    verifier("les neuf chiffres du mois sont ceux calculés à la main", ligne == attendu,
             f"attendu {attendu}\n       → obtenu  {ligne}")

    print("\n3. Ce que les chiffres veulent dire (la faute qui coûterait cher)")
    code, s = psql(GERANCE + " select commission_due, courses_encaissees_par_coursiers "
                             "from public.express_compta_mois where mois='2026-09-01';")
    verifier("la recette de CLT (540 F) n'est PAS le prix des courses (3 600 F)",
             s == "540|3600", s)
    code, s = psql(GERANCE + " select courses_encaissees_par_coursiers from public.express_compta_mois where mois='2026-09-01';")
    verifier("une course en chemin (1 500 F) n'est comptée nulle part : rien n'est dû avant la livraison",
             s == "3600", s)
    code, s = psql(GERANCE + " select recharges_encaissees from public.express_compta_mois where mois='2026-09-01';")
    verifier("une recharge refusée (9 999 F) ne compte nulle part", s == "5000", s)
    code, s = psql(GERANCE + " select count(*) from public.express_compta_mois;")
    verifier("les mois ne se mélangent pas : août a sa propre ligne", s == "2", s)
    code, s = psql(GERANCE + " select commission_due, commission_prelevee from public.express_compta_mois where mois='2026-08-01';")
    verifier("août : 75 F de commission, déjà prélevée", s == "75|75", s)

    print("\n4. Ce que CLT doit encore aux coursiers")
    code, s = psql(GERANCE + " select coursier || '/' || solde_du_au_coursier || '/' || commission_a_prelever "
                             "|| '/' || sans_portefeuille from public.express_compta_coursiers order by coursier;")
    verifier("Ibrahim : 4 700 F de solde dû, 150 F à prélever",
             "Coursier Ibrahim/4700/150/false" in s, s)
    # LE PIÈGE MESURÉ EN PRODUCTION : le détail par coursier ne doit pas perdre l'argent que
    # doit un coursier sans portefeuille.
    verifier("Salif, qui n'a jamais rechargé, apparaît quand même avec ses 90 F",
             "Coursier Salif/0/90/true" in s, s)
    code, total = psql(GERANCE + " select sum(commission_a_prelever)::int from public.express_compta_coursiers;")
    code, mois = psql(GERANCE + " select sum(commission_a_prelever)::int from public.express_compta_mois;")
    # On ne code pas le chiffre en dur : c'est l'ÉGALITÉ des deux lectures qui est la garantie
    # (150 d'Ibrahim + 90 de Salif ; les 75 F d'août sont déjà prélevés et ne comptent pas).
    verifier("le détail par coursier et le total des mois disent le MÊME chiffre",
             total == mois and total == "240", f"coursiers {total} / mois {mois}")

    print("\n5. Personne d'autre que le bureau ne voit ces chiffres")
    code, s = psql(COURSIER + " select count(*) from public.express_compta_mois;")
    verifier("un coursier ne voit aucune ligne", s == "0", s)
    code, s = psql(CLIENTE + " select count(*) from public.express_compta_coursiers;")
    verifier("une cliente ne voit aucune ligne", s == "0", s)
    code, s = psql("select count(*) from public.express_compta_mois;")   # aucun essai.uid posé
    verifier("un visiteur sans compte ne voit aucune ligne", s == "0", s)

    print("\n6. Un mois sans rien ne casse pas, et ne renvoie pas de nul")
    psql("truncate public.express_courses; truncate public.express_recharges;")
    code, s = psql(GERANCE + " select count(*) from public.express_compta_mois;")
    verifier("aucune course, aucune ligne — pas d'erreur", code == 0 and s == "0", s)
    psql("""insert into public.express_recharges (coursier_id, montant, status, created_at) values
            ('22222222-2222-2222-2222-222222222222', 3000, 'validee', '2026-10-02 08:00+00');""")
    code, s = psql(GERANCE + " select courses_livrees, commission_due, recharges_encaissees "
                             "from public.express_compta_mois where mois='2026-10-01';")
    verifier("un mois avec une recharge mais aucune course affiche des zéros, pas des nuls",
             s == "0|0|3000", s)

    psql(f"drop database if exists {BASE};", base="postgres")
    print(f"\n{reussies} réussie(s), {echouees} échouée(s).")
    return 1 if echouees else 0


if __name__ == "__main__":
    sys.exit(main())
