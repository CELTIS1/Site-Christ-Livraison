#!/usr/bin/env python3
"""
LA VUE COMPTABLE D'EXPRESS DIT VRAI, JOUÉE DANS UN VRAI POSTGRES (20/09/2026, point 20.F)
===========================================================================================
La commission d'une course livrée est prélevée sur le portefeuille par le trigger, à la
livraison — même quand le portefeuille passe en négatif. La vue par coursier calculait
« commission à prélever » sur commission_reglee = false : toujours 0. Cet essai monte le décor,
joue la migration, et vérifie que ce que le coursier doit à CLT est bien son solde négatif,
et que le carnet d'adresses a sa colonne.

USAGE
  python3 tests/express/la-compta-dit-vrai-en-postgres.py
"""
import os, subprocess, sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIGRATION = os.path.join(RACINE, "_sql-prive", "2026-09-20-express-carnet-et-compta.sql")
BASE = "essai_express_compta_clt"
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


A = "11111111-1111-1111-1111-111111111111"   # a rechargé 5 000, a livré pour 1 200 de commission → CLT lui doit 3 800
B = "22222222-2222-2222-2222-222222222222"   # jamais rechargé, a livré pour 900 de commission → doit 900 (solde -900)
C = "33333333-3333-3333-3333-333333333333"   # course Wave livrée sans paiement : commission pas prélevée (300)

DECOR = f"""
create schema if not exists auth;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function public.migration_appliquee(nom text, resume text) returns text language sql as $$ select nom $$;
create function public.a_acces_gestion() returns boolean language sql stable as $$ select true $$;
create table public.profiles (id uuid primary key, full_name text, role text);
insert into public.profiles values ('{A}', 'Ali', 'coursier'), ('{B}', 'Bakary', 'coursier'), ('{C}', 'Cissé', 'coursier');
create table public.express_wallets (coursier_id uuid primary key, solde numeric not null default 0, updated_at timestamptz default now());
insert into public.express_wallets (coursier_id, solde) values ('{A}', 3800), ('{B}', -900);
create table public.express_courses (id uuid primary key default gen_random_uuid(), coursier_id uuid, status text, commission_montant numeric, commission_reglee boolean not null default false);
insert into public.express_courses (coursier_id, status, commission_montant, commission_reglee) values
  ('{A}', 'livree', 700, true), ('{A}', 'livree', 500, true),
  ('{B}', 'livree', 900, true),
  ('{C}', 'livree', 300, false),
  ('{A}', 'annulee', 400, false);
create view public.express_compta_coursiers as select coursier_id, 'x'::text as coursier, 0::numeric as solde_du_au_coursier, 0::numeric as commission_a_prelever, now() as updated_at, false as sans_portefeuille from public.express_wallets;
"""


def main():
    if not os.path.exists(MIGRATION):
        print("⏭️  migration absente (dossier privé, hors dépôt) : essai sauté."); return 0
    subprocess.run(["service", "postgresql", "start"], capture_output=True)
    psql(f"drop database if exists {BASE};", base="postgres")
    code, out = psql(f"create database {BASE};", base="postgres")
    if code != 0:
        print("⏭️  Postgres n'est pas joignable : essai sauté.\n   " + out[:200]); return 0
    code, out = psql(DECOR)
    if code != 0:
        print("❌ Le décor ne se monte pas :\n" + out[-800:]); return 1

    print("\n1. La migration")
    sql = open(MIGRATION, encoding="utf-8").read()
    code, out = psql(sql); verifier("elle passe (la vue se remplace sans se supprimer)", code == 0, out[-500:])
    code, out = psql(sql); verifier("elle se rejoue", code == 0, out[-300:])
    code, out = psql("select column_default from information_schema.columns where table_name='profiles' and column_name='express_adresses';")
    verifier("profiles.express_adresses existe, vide par défaut", "'[]'" in out, out)

    print("\n2. Ce que la vue dit par coursier")
    code, out = psql("select coursier, solde_du_au_coursier, commission_a_prelever, sans_portefeuille from public.express_compta_coursiers order by coursier;")
    lignes = dict((l.split('|')[0], l.split('|')[1:]) for l in out.split('\n') if l)
    verifier("Ali : CLT lui doit 3 800, il ne doit rien", lignes.get('Ali') == ['3800', '0', 'f'], lignes.get('Ali'))
    verifier("Bakary : jamais rechargé mais portefeuille à -900 → il doit 900 (avant : 0)", lignes.get('Bakary') == ['0', '900', 'f'], lignes.get('Bakary'))
    verifier("Cissé : sans portefeuille, commission Wave pas prélevée → il doit 300", lignes.get('Cissé') == ['0', '300', 't'], lignes.get('Cissé'))
    verifier("le total dû par les coursiers fait 1 200, plus jamais 0 par construction", sum(float(v[1]) for v in lignes.values()) == 1200, lignes)

    psql(f"drop database if exists {BASE};", base="postgres")
    print(f"\n———\n{reussies} vérifications réussies, {echouees} échouées")
    return 1 if echouees else 0


if __name__ == "__main__":
    sys.exit(main())
