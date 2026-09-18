#!/usr/bin/env python3
"""
UN COLIS SUPPRIMÉ LAISSE UNE TRACE — JOUÉ DANS UN VRAI POSTGRES — 18 septembre 2026
===========================================================================================
Le 17 au soir, l'équipe a supprimé des colis pour les recréer. Impossible de dire lesquels :
un colis supprimé ne laissait aucune trace. Ce déclencheur garde la ligne entière au moment
où elle disparaît — de quoi reconstituer le colis, numéro compris.

DEUX PROMESSES, et la seconde compte autant que la première :
  1. la trace contient TOUT ce qu'il faut pour recréer le colis à l'identique ;
  2. le journal ne bloque JAMAIS la suppression. Un colis qu'on ne peut plus supprimer
     empêcherait de traiter un doublon — plus coûteux qu'une ligne de journal manquante.

USAGE
  python3 tests/suppression/essai-en-postgres.py
"""

import os, subprocess, sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIGRATION = os.path.join(RACINE, "_sql-prive", "2026-09-18-un-colis-supprime-laisse-une-trace.sql")
BASE = "essai_suppression_clt"

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


EQUIPE = '22222222-2222-2222-2222-222222222222'

# Les colonnes sont celles de la vraie table, relevées en base le 17-18/09/2026.
DECOR = f"""
create schema if not exists auth;
create table public.profiles (id uuid primary key, full_name text, role text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('essai.uid', true), '')::uuid $$;
create function public.migration_appliquee(nom text, resume text) returns text
  language sql as $$ select 'enregistrée : ' || nom $$;
create table public.activity_log (
  id bigserial primary key, actor_id uuid, actor_role text, action text,
  target_id uuid, target_type text, details jsonb, created_at timestamptz default now());
create table public.colis (
  id uuid primary key default gen_random_uuid(), numero text, description text,
  destination text, commune_destination text, destinataire_telephone text,
  montant_article numeric, montant_livraison numeric, statut text,
  fournisseur_id uuid, livreur_id uuid, reporte_au date,
  created_at timestamptz default now());
insert into public.profiles values ('{EQUIPE}', 'Bureau CLT', 'equipe');
insert into public.colis (numero, description, destination, commune_destination,
                          destinataire_telephone, montant_article, montant_livraison, statut, reporte_au)
  values ('CLT-260918-01900', 'Deux paires de chaussures', 'Riviera 2', 'Cocody',
          '07 01 02 03 04', 20000, 1500, 'en_attente', '2026-09-19');
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

    print("\n1. Le déclencheur se pose, et se repose sans doubler")
    migration = open(MIGRATION, encoding="utf-8").read()
    code, s = psql(migration)
    verifier("la migration passe sans erreur", code == 0, s[-400:])
    code, s = psql(migration)
    code, s = psql("select count(*) from pg_trigger where tgname='journal_suppression_colis' and not tgisinternal;")
    verifier("un seul déclencheur, même après deux passages", s == "1", s)

    print("\n2. La trace permet de reconstituer le colis")
    psql(f"set essai.uid = '{EQUIPE}'; delete from public.colis where numero = 'CLT-260918-01900';")
    code, s = psql("select count(*) from public.colis;")
    verifier("le colis est bien supprimé : on n'empêche pas le geste", s == "0", s)
    code, s = psql("select action, target_type, actor_role, details->>'numero' from public.activity_log;")
    verifier("une ligne de journal le dit, avec le numéro et qui l'a fait",
             s == "delete_colis|colis|equipe|CLT-260918-01900", s)
    code, s = psql("""select (details->'colis'->>'description'),
                             (details->'colis'->>'montant_article'),
                             (details->'colis'->>'destinataire_telephone'),
                             (details->'colis'->>'reporte_au'),
                             (details->'colis'->>'commune_destination')
                        from public.activity_log;""")
    verifier("et TOUT le contenu du colis, de quoi le recréer à l'identique",
             s == "Deux paires de chaussures|20000|07 01 02 03 04|2026-09-19|Cocody", s)
    code, s = psql("select details->>'operation' from public.activity_log;")
    verifier("la nature du geste est nommée", s == "DELETE", s)

    print("\n3. LE POINT LE PLUS IMPORTANT : le journal ne bloque jamais la suppression")
    psql("""insert into public.colis (numero, description, statut)
            values ('CLT-260918-01901', 'Un carton', 'en_attente');""")
    # On sabote l'écriture du journal — le cas réel serait une colonne renommée, un droit retiré.
    psql("""create function public.casser_le_journal() returns trigger language plpgsql as
              $$ begin raise exception 'journal indisponible'; end $$;
            create trigger zz_casse before insert on public.activity_log
              for each row execute function public.casser_le_journal();""")
    code, s = psql(f"set essai.uid = '{EQUIPE}'; delete from public.colis where numero = 'CLT-260918-01901';")
    verifier("la suppression passe alors que le journal est en panne", code == 0, s[-300:])
    code, s = psql("select count(*) from public.colis where numero = 'CLT-260918-01901';")
    verifier("et le colis est bien parti, pas seulement sans erreur", s == "0", s)
    psql("drop trigger zz_casse on public.activity_log;")

    print("\n4. Ce que le déclencheur ne fait pas")
    psql("""insert into public.colis (numero, description, statut) values ('CLT-260918-01902', 'Sac', 'en_attente');""")
    avant = psql("select count(*) from public.activity_log;")[1]
    psql(f"set essai.uid = '{EQUIPE}'; update public.colis set statut='recupere' where numero='CLT-260918-01902';")
    code, apres = psql("select count(*) from public.activity_log;")
    verifier("une modification n'écrit rien : seule la suppression est journalisée ici",
             avant == apres, f"{avant} → {apres}")
    code, s = psql("delete from public.colis where numero='CLT-260918-01902'; select actor_id is null from public.activity_log order by id desc limit 1;")
    verifier("une suppression sans compte identifié est quand même tracée", s == "t", s)

    psql(f"drop database if exists {BASE};", base="postgres")
    print(f"\n{reussies} réussie(s), {echouees} échouée(s).")
    return 1 if echouees else 0


if __name__ == "__main__":
    sys.exit(main())
