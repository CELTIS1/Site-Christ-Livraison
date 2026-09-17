#!/usr/bin/env python3
"""
LE JOURNAL AVANT/APRÈS, JOUÉ DANS UN VRAI POSTGRES — point 8.4, 17 septembre 2026
===========================================================================================
Le remède au trou du journal est un déclencheur en base, pas du code d'écran. On ne peut donc
pas le vérifier en JavaScript : il faut une vraie base, de vraies écritures, et regarder ce
qui s'est écrit dans activity_log.

Cet essai monte un décor minimal (profiles, activity_log, auth.uid(), trois tables d'argent),
rejoue la migration telle quelle, et vérifie ce qu'on lui demande vraiment :
  • une correction de montant laisse une trace lisible, avec l'avant ET l'après ;
  • une modification qui ne change rien n'écrit pas de ligne ;
  • updated_at tout seul ne compte pas pour un changement ;
  • une table sans colonne id est journalisée quand même ;
  • REJOUER la migration ne double pas les déclencheurs ;
  • elle passe sur une base où certaines tables manquent encore (le cas d'une restauration) ;
  • et surtout : SI LE JOURNAL TOMBE, LE TRAVAIL PASSE QUAND MÊME.

Il ne touche jamais à la base de production : il crée sa propre base et la supprime après.

USAGE
  python3 tests/journal/essai-en-postgres.py
"""

import os, subprocess, sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIGRATION = os.path.join(RACINE, "_sql-prive", "2026-09-17-journal-avant-apres.sql")
BASE = "essai_journal_clt"

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
    """Joue du SQL en tant que postgres et renvoie (code, sortie)."""
    args = ["psql", "-q", "-v", "ON_ERROR_STOP=1", "-d", base]
    if tuples:
        args += ["-At", "-F", "|"]
    r = subprocess.run(["su", "postgres", "-c", " ".join(
        ["'" + a.replace("'", "'\\''") + "'" for a in args])],
        input=sql, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip()


DECOR = """
create schema if not exists auth;
create table public.profiles (id uuid primary key, role text);
create table public.activity_log (
  id bigserial primary key, actor_id uuid, actor_role text, action text,
  target_id uuid, target_type text, details jsonb, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('essai.uid', true), '')::uuid $$;
create function public.migration_appliquee(nom text, resume text) returns text
  language sql as $$ select 'enregistrée : ' || nom $$;

-- Trois des quatorze tables d'argent. Les onze autres manquent VOLONTAIREMENT : c'est le cas
-- d'une base qu'on reconstruit, et la migration doit passer dessus sans broncher.
create table public.gestion_recettes (id uuid primary key default gen_random_uuid(),
  jour date, montant numeric, libelle text, updated_at timestamptz default now());
create table public.gestion_parametres (id uuid primary key default gen_random_uuid(),
  cle text, valeur numeric, created_at timestamptz default now());
create table public.remises_caisse (jour date, montant numeric);   -- sans colonne id
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

    migration = open(MIGRATION, encoding="utf-8").read()

    print("\n1. La migration passe, même sur une base incomplète")
    psql(DECOR)
    code, sortie = psql(migration)
    verifier("elle se joue sans erreur alors que 11 des 14 tables manquent", code == 0, sortie[-400:])
    code, n = psql("select count(*) from pg_trigger t join pg_proc p on p.oid=t.tgfoid "
                   "where p.proname='journaliser_changement' and not t.tgisinternal;")
    verifier("les 3 tables présentes ont leur déclencheur", n == "3", n)
    code, sortie = psql(migration)
    code, n2 = psql("select count(*) from pg_trigger t join pg_proc p on p.oid=t.tgfoid "
                    "where p.proname='journaliser_changement' and not t.tgisinternal;")
    verifier("la rejouer ne double pas les déclencheurs", code == 0 and n2 == "3", n2)

    print("\n2. Ce que le journal garde, et ce qu'il laisse passer")
    psql("""
      set essai.uid = '11111111-1111-1111-1111-111111111111';
      insert into public.profiles values ('11111111-1111-1111-1111-111111111111', 'gerant');
      insert into public.gestion_recettes (jour, montant, libelle) values ('2026-09-17', 45000, 'Recette du jour');
      update public.gestion_recettes set montant = 54000 where libelle = 'Recette du jour';
      update public.gestion_recettes set montant = 54000 where libelle = 'Recette du jour';   -- ne change rien
      update public.gestion_recettes set updated_at = now() where libelle = 'Recette du jour'; -- que la date technique
      insert into public.remises_caisse values ('2026-09-17', 200000);
      delete from public.gestion_recettes where libelle = 'Recette du jour';
    """)
    code, n = psql("select count(*) from public.activity_log;")
    verifier("six écritures, quatre lignes de journal : le bruit est filtré", n == "4", n)
    code, s = psql("select details->'champs'->'montant'->>'avant', details->'champs'->'montant'->>'apres' "
                   "from public.activity_log where action='update_gestion_recettes';")
    verifier("la correction de montant garde l'avant ET l'après (45000 → 54000)", s == "45000|54000", s)
    code, s = psql("select count(*) from public.activity_log where details->'champs' ? 'updated_at';")
    verifier("updated_at n'apparaît jamais dans les champs", s == "0", s)
    code, s = psql("select actor_role from public.activity_log limit 1;")
    verifier("le rôle vient de la base, pas de l'écran", s == "gerant", s)
    code, s = psql("select target_id is null, details->>'operation' from public.activity_log "
                   "where target_type='remises_caisse';")
    verifier("une table sans id est journalisée quand même", s == "t|INSERT", s)
    code, s = psql("select details->'champs'->'montant'->>'avant' from public.activity_log "
                   "where action='delete_gestion_recettes';")
    verifier("une suppression garde ce qui a été supprimé", s == "54000", s)

    print("\n3. LE POINT LE PLUS IMPORTANT : le journal ne bloque jamais le travail")
    # On sabote l'écriture du journal — le cas réel serait une colonne renommée, un droit retiré.
    psql("""
      create function public.casser_le_journal() returns trigger language plpgsql as
        $$ begin raise exception 'journal indisponible'; end $$;
      create trigger zz_casse before insert on public.activity_log
        for each row execute function public.casser_le_journal();
    """)
    code, sortie = psql("""
      set essai.uid = '11111111-1111-1111-1111-111111111111';
      insert into public.gestion_recettes (jour, montant, libelle) values ('2026-09-18', 1000, 'Journal cassé');
    """)
    verifier("la recette s'enregistre alors que le journal est en panne", code == 0, sortie[-300:])
    code, s = psql("select montant from public.gestion_recettes where libelle='Journal cassé';")
    verifier("et elle est bien en base, pas seulement sans erreur", s == "1000", s)
    psql("drop trigger zz_casse on public.activity_log;")

    psql(f"drop database if exists {BASE};", base="postgres")
    print(f"\n{reussies} réussie(s), {echouees} échouée(s).")
    return 1 if echouees else 0


if __name__ == "__main__":
    sys.exit(main())
