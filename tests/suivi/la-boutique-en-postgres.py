#!/usr/bin/env python3
"""
LA BOUTIQUE SUR LE SUIVI PUBLIC, JOUÉE DANS UN VRAI POSTGRES — point 19.6, 20 septembre 2026
===========================================================================================
Celtis : « pour un colis qui ne nous appartient pas, on nous appelle. Il faut d'abord pouvoir
appeler la boutique — son numéro direct et son WhatsApp — et ensuite seulement nos contacts. »

Le numéro d'une boutique n'est pas public. Il est pour SON destinataire, celui qui prouve les
quatre derniers chiffres de son téléphone. L'essai vérifie donc, comme pour l'histoire du
colis : le chemin vérifié donne la boutique ; les trois autres — sans chiffres, faux chiffres,
trop d'essais — ne la donnent pas.

USAGE
  python3 tests/suivi/la-boutique-en-postgres.py
"""

import os, subprocess, sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AVANT = os.path.join(RACINE, "_sql-prive", "2026-09-17-l-histoire-du-colis.sql")
MIGRATION = os.path.join(RACINE, "_sql-prive", "2026-09-20-la-boutique-sur-le-suivi.sql")
BASE = "essai_suivi_boutique_clt"

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


DECOR = """
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
create table public.profiles (id uuid primary key, full_name text, avatar_url text, company_name text, phone text);
create table public.colis (
  id uuid primary key default gen_random_uuid(),
  numero text unique, statut text, description text, destination text, commune_destination text,
  photo_url text, photo_livraison_url text,
  montant numeric, montant_article numeric, montant_livraison numeric,
  livreur_id uuid, livreur_collecte_id uuid, fournisseur_id uuid, creneau_estime text,
  destinataire_telephone text,
  created_at timestamptz default now(),
  recupere_at timestamptz, en_livraison_at timestamptz, livre_at timestamptz, non_livre_at timestamptz, retour_at timestamptz,
  collecte_depart_at timestamptz);
create table public.suivi_tentatives (numero text, heure timestamptz, nb integer, primary key (numero, heure));
create function public.migration_appliquee(nom text, resume text) returns text
  language sql as $$ select 'enregistrée : ' || nom $$;
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

insert into public.profiles values
  ('11111111-1111-1111-1111-111111111111', 'Kasimir WANDAOGO', 'https://x/k.jpg', null, '07 00 00 00 01'),
  ('22222222-2222-2222-2222-222222222222', 'Aminata KONÉ', null, 'Boutique Ami Chic', '05 11 22 33 44'),
  ('33333333-3333-3333-3333-333333333333', 'Fatou DIALLO', null, '', '01 55 66 77 88');
insert into public.colis (numero, statut, description, destinataire_telephone, montant_article, montant_livraison, livreur_id, fournisseur_id)
  values ('CLT-260920-00001', 'en_livraison', 'Deux robes', '07 01 02 03 04', 20000, 1500,
          '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
         ('CLT-260920-00002', 'livre', 'Un sac', '07 01 02 03 05', 5000, 1500,
          '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333'),
         ('CLT-260920-00003', 'en_attente', 'Sans boutique', '07 01 02 03 06', 5000, 1500, null, null);
"""

VERIFIE = "select * from public.suivi_colis('CLT-260920-00001', '03 04')"
BRUT = "select * from public.suivi_colis('CLT-260920-00001')"
FAUX = "select * from public.suivi_colis('CLT-260920-00001', '9999')"


def main():
    if not (os.path.exists(MIGRATION) and os.path.exists(AVANT)):
        print("⏭️  migration absente (dossier privé, hors dépôt) : essai sauté.")
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
    # L'état de la production : l'histoire du colis (17/09) est déjà passée.
    code, sortie = psql(open(AVANT, encoding="utf-8").read())
    if code != 0:
        print("❌ La migration du 17/09 ne passe pas dans le décor :\n" + sortie[-600:])
        return 1

    print("\n1. La migration s'applique par-dessus l'existant")
    code, sortie = psql(open(MIGRATION, encoding="utf-8").read())
    verifier("elle passe sans erreur sur la vue et la fonction en place", code == 0, sortie[-500:])
    code, s = psql("select count(*) from information_schema.columns where table_name='colis_suivi_public' "
                   "and column_name in ('boutique_nom','boutique_tel');")
    verifier("les deux colonnes sont dans la vue publique", s == "2", s)
    code, s = psql(open(MIGRATION, encoding="utf-8").read())
    verifier("la rejouer ne casse rien", code == 0, s[-300:])

    print("\n2. Le chemin vérifié donne la boutique")
    code, s = psql(f"select boutique_nom, boutique_tel, description, montant_total, livreur_nom from ({VERIFIE}) v;")
    verifier("l'enseigne d'abord, et son numéro — le reste de la fiche comme avant",
             s == "Boutique Ami Chic|05 11 22 33 44|Deux robes|21500|Kasimir WANDAOGO", s)
    code, s = psql("select boutique_nom from public.suivi_colis('CLT-260920-00002', '0305') v;")
    verifier("sans enseigne, c'est le nom de la personne", s == "Fatou DIALLO", s)
    code, s = psql("select count(*), max(boutique_nom) from public.suivi_colis('CLT-260920-00003', '0306') v;")
    verifier("un colis sans boutique se lit quand même, la boutique reste vide", s == "1|", s)

    print("\n3. LES SILENCES : le numéro d'une boutique n'est pas public")
    for nom, requete in [("sans les quatre chiffres", BRUT), ("avec de mauvais chiffres", FAUX)]:
        code, s = psql(f"select coalesce(boutique_nom, '—'), coalesce(boutique_tel, '—'), statut from ({requete}) v;")
        verifier(f"{nom} : ni nom ni numéro, le statut passe quand même", s == "—|—|en_livraison", s)
    for _ in range(5):
        psql(FAUX + ";")
    code, s = psql(f"select coalesce(boutique_tel, '—') from ({VERIFIE}) v;")
    verifier("après cinq essais ratés, même les BONS chiffres ne donnent plus le numéro", s == "—", s)
    code, s = psql("select nb from public.suivi_tentatives;")
    verifier("les essais sont comptés par heure, comme avant", s and int(s) >= 5, s)
    code, s = psql("select count(*) from public.suivi_colis('CLT-260920-99999', '0304') v;")
    verifier("un numéro inconnu ne renvoie rien du tout", s == "0", s)

    psql(f"drop database if exists {BASE};", base="postgres")
    print(f"\n{reussies} réussie(s), {echouees} échouée(s).")
    return 1 if echouees else 0


if __name__ == "__main__":
    sys.exit(main())
