#!/usr/bin/env python3
"""
L'HISTOIRE DU COLIS, JOUÉE DANS UN VRAI POSTGRES — point 10.5, 17 septembre 2026
===========================================================================================
Cette migration touche une page PUBLIQUE. Le risque n'est pas qu'elle affiche mal une heure :
c'est qu'elle en dise trop. Le suivi a deux niveaux, et c'est délibéré — le numéro seul donne
le statut brut, le numéro PLUS les quatre derniers chiffres du téléphone du destinataire donne
la fiche. Savoir qu'un colis a été récupéré à 9 h 40 et livré à 14 h 12, c'est connaître les
habitudes d'une cliente et les tournées d'un livreur : cela appartient au second niveau.

L'essai vérifie donc surtout des SILENCES : que les quatre chemins non vérifiés — sans
chiffres, mauvais chiffres, trop d'essais, numéro inconnu — ne laissent filtrer aucune heure.
Et que le chemin vérifié, lui, les donne toutes.

USAGE
  python3 tests/suivi/essai-en-postgres.py
"""

import os, subprocess, sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIGRATION = os.path.join(RACINE, "_sql-prive", "2026-09-17-l-histoire-du-colis.sql")
BASE = "essai_suivi_clt"

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


# Le décor : la forme réelle, réduite à ce que la vue et la fonction touchent.
DECOR = """
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
create table public.profiles (id uuid primary key, full_name text, avatar_url text);
create table public.colis (
  id uuid primary key default gen_random_uuid(),
  numero text unique, statut text, description text, destination text, commune_destination text,
  photo_url text, photo_livraison_url text,
  montant numeric, montant_article numeric, montant_livraison numeric,
  livreur_id uuid, livreur_collecte_id uuid, creneau_estime text,
  destinataire_telephone text,
  created_at timestamptz default now(),
  recupere_at timestamptz, livre_at timestamptz, non_livre_at timestamptz, retour_at timestamptz,
  collecte_depart_at timestamptz);
create table public.suivi_tentatives (numero text, heure timestamptz, nb integer, primary key (numero, heure));
create function public.migration_appliquee(nom text, resume text) returns text
  language sql as $$ select 'enregistrée : ' || nom $$;

-- La vue et les deux déclencheurs TELS QU'ILS SONT EN PRODUCTION AUJOURD'HUI : la migration
-- doit s'appliquer par-dessus l'existant, pas sur une base vierge.
create view public.colis_suivi_public as
SELECT c.id, c.numero, c.statut, c.description, c.destination, c.commune_destination,
       c.photo_url, c.photo_livraison_url,
       COALESCE(CASE WHEN c.montant_article IS NOT NULL OR c.montant_livraison IS NOT NULL
                     THEN COALESCE(c.montant_article, 0::numeric) + COALESCE(c.montant_livraison, 0::numeric)
                     ELSE c.montant END, c.montant) AS montant_total,
       CASE WHEN c.statut = 'en_livraison' THEN p.full_name ELSE NULL::text END AS livreur_nom,
       CASE WHEN c.statut = 'en_livraison' THEN p.avatar_url ELSE NULL::text END AS livreur_photo_url,
       CASE WHEN c.statut = 'en_livraison' THEN c.creneau_estime ELSE NULL::text END AS creneau_estime,
       c.created_at
  FROM public.colis c LEFT JOIN public.profiles p ON p.id = c.livreur_id;

create function public.colis_touch_horodatages() returns trigger language plpgsql as $$
begin
  if new.statut = 'livre' and (old.statut is distinct from 'livre') then new.livre_at := now(); end if;
  if new.statut = 'recupere' and (old.statut is distinct from 'recupere') then new.recupere_at := now(); end if;
  if new.statut = 'non_livre' and (old.statut is distinct from 'non_livre') then new.non_livre_at := now(); end if;
  if new.statut = 'retour' and (old.statut is distinct from 'retour') then new.retour_at := now(); end if;
  return new;
end $$;
create function public.colis_horodatages_insert() returns trigger language plpgsql as $$
begin
  if new.statut = 'livre' and new.livre_at is null then new.livre_at := now(); end if;
  return new;
end $$;
create trigger t_maj before update on public.colis for each row execute function public.colis_touch_horodatages();
create trigger t_ins before insert on public.colis for each row execute function public.colis_horodatages_insert();

insert into public.profiles values ('11111111-1111-1111-1111-111111111111', 'Kasimir WANDAOGO', 'https://x/k.jpg');
insert into public.colis (numero, statut, description, destinataire_telephone, montant_article, montant_livraison, livreur_id)
  values ('CLT-260917-00001', 'en_attente', 'Deux paires de chaussures', '07 01 02 03 04', 20000, 1500,
          '11111111-1111-1111-1111-111111111111');
"""

VERIFIE = "select * from public.suivi_colis('CLT-260917-00001', '03 04')"
BRUT = "select * from public.suivi_colis('CLT-260917-00001')"
FAUX = "select * from public.suivi_colis('CLT-260917-00001', '9999')"
HEURES = "recupere_at, en_livraison_at, livre_at, non_livre_at, retour_at"


def main():
    if not os.path.exists(MIGRATION):
        print("⏭️  " + MIGRATION + " est absent (dossier privé, hors dépôt) : essai sauté.")
        return 0

    subprocess.run(["service", "postgresql", "start"], capture_output=True)
    code, sortie = psql(f"drop database if exists {BASE}; create database {BASE};", base="postgres")
    if code != 0:
        print("⏭️  Postgres n'est pas joignable sur cette machine : essai sauté.\n   " + sortie[:200])
        return 0

    code, sortie = psql(DECOR)
    if code != 0:
        print("❌ Le décor ne se monte pas :\n" + sortie[-600:])
        return 1

    print("\n1. La migration s'applique par-dessus l'existant")
    code, sortie = psql(open(MIGRATION, encoding="utf-8").read())
    verifier("elle passe sans erreur sur la vue et les déclencheurs déjà en place", code == 0, sortie[-500:])
    code, s = psql("select count(*) from information_schema.columns where table_name='colis_suivi_public' "
                   f"and column_name in ('recupere_at','en_livraison_at','livre_at','non_livre_at','retour_at');")
    verifier("les cinq horodatages sont dans la vue publique", s == "5", s)
    code, s = psql(psql_rejeu := open(MIGRATION, encoding="utf-8").read())
    verifier("la rejouer ne casse rien (elle est faite pour être relancée)", code == 0, s[-300:])

    print("\n2. L'heure du départ en livraison, qui n'existait pas")
    psql("update public.colis set statut='recupere' where numero='CLT-260917-00001';")
    psql("update public.colis set statut='en_livraison' where numero='CLT-260917-00001';")
    code, s = psql("select (recupere_at is not null), (en_livraison_at is not null), "
                   "(en_livraison_at >= recupere_at) from public.colis;")
    verifier("elle est posée au passage en livraison, après la récupération", s == "t|t|t", s)
    code, s = psql("update public.colis set statut='en_livraison' where numero='CLT-260917-00001'; "
                   "select en_livraison_at = (select en_livraison_at from public.colis) from public.colis;")
    verifier("réenregistrer le même statut ne réécrit pas l'heure", s == "t", s)

    print("\n3. LE POINT DÉCISIF : le chemin vérifié donne l'histoire")
    code, s = psql(f"select {HEURES.replace(', ', ' is not null, ')} is not null from ({VERIFIE}) v;")
    verifier("récupéré et en livraison sont donnés ; les étapes non atteintes restent vides",
             s == "t|t|f|f|f", s)
    code, s = psql(f"select description, montant_total, livreur_nom from ({VERIFIE}) v;")
    verifier("et le reste de la fiche est là, comme avant", s.startswith("Deux paires de chaussures|21500|Kasimir"), s)

    print("\n4. LES SILENCES : aucun des chemins non vérifiés ne laisse filtrer une heure")
    for nom, requete in [("sans les quatre chiffres", BRUT), ("avec de mauvais chiffres", FAUX)]:
        code, s = psql(f"select coalesce({HEURES.replace(', ', '::text, ')}::text, '—') from ({requete}) v;"
                       .replace("::text::text", "::text"))
        code2, brut = psql(f"select {HEURES} from ({requete}) v;")
        verifier(f"{nom} : les cinq heures sont nulles", brut == "||||", brut)
        code3, statut = psql(f"select statut, (description is null) from ({requete}) v;")
        verifier(f"{nom} : le statut passe quand même (c'est le service rendu)",
                 statut.startswith("en_livraison|t"), statut)
    # Cinq essais ratés dans l'heure : même réponse, sans indice.
    for _ in range(5):
        psql(FAUX + ";")
    code, s = psql(f"select {HEURES} from ({VERIFIE}) v;")
    verifier("après cinq essais ratés, même les BONS chiffres ne donnent plus l'histoire", s == "||||", s)
    code, s = psql("select nb from public.suivi_tentatives;")
    verifier("les essais sont comptés par heure, comme avant", s and int(s) >= 5, s)
    code, s = psql("select count(*) from public.suivi_colis('CLT-260917-99999', '0304') v;")
    verifier("un numéro inconnu ne renvoie rien du tout, avec ou sans chiffres", s == "0", s)

    print("\n5. Ce qu'on n'invente pas")
    psql("""insert into public.colis (numero, statut, description, destinataire_telephone, recupere_at)
            values ('CLT-260101-00009', 'livre', 'Colis d''avant la migration', '07 05 06 07 08', now() - interval '30 days');""")
    code, s = psql("select (en_livraison_at is null) from public.colis where numero='CLT-260101-00009';")
    verifier("un colis passé en livraison avant aujourd'hui n'a pas d'heure fabriquée", s == "t", s)

    psql(f"drop database if exists {BASE};", base="postgres")
    print(f"\n{reussies} réussie(s), {echouees} échouée(s).")
    return 1 if echouees else 0


if __name__ == "__main__":
    sys.exit(main())
