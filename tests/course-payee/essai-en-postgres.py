#!/usr/bin/env python3
"""
LA COURSE EST DUE MÊME SI LE COLIS REVIENT — JOUÉ DANS UN VRAI POSTGRES — 18 septembre 2026
===========================================================================================
Celtis, le 18 : « le livreur s'est déplacé, il est arrivé au lieu de rencontre pour livrer et
le client décide finalement de ne plus prendre le colis. Mais là, il paye la livraison. »

La règle de l'argent est écrite deux fois — en JavaScript pour l'écran, en SQL pour le serveur —
et les deux doivent dire le même chiffre au même livreur le même soir. Ce fichier joue la
version SQL dans un vrai Postgres, sur les mêmes cas que le banc JavaScript
(tests/la-course-payee-sans-livraison.test.mjs), et compare les montants un à un.

Le décor est COPIÉ du vrai schéma (colonnes relevées en base le 18/09/2026) : un décor écrit
de mémoire s'accorde avec un code écrit de mémoire, et l'essai passe au vert pendant que la
production refuse.

USAGE
  python3 tests/course-payee/essai-en-postgres.py
"""

import os, subprocess

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIGRATION = os.path.join(RACINE, "_sql-prive",
                         "2026-09-18-la-course-est-due-meme-si-le-colis-revient.sql")
BASE = "essai_course_payee_clt"

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


EXPEDITION = "Expédition (intérieur)"

DECOR = f"""
create function public.migration_appliquee(nom text, resume text) returns text
  language sql as $$ select 'enregistrée : ' || nom $$;
create table public.colis (
  id uuid primary key default gen_random_uuid(), numero text,
  statut text, commune_destination text,
  montant numeric, montant_article numeric, montant_livraison numeric,
  article_non_encaisse boolean default false,
  livraison_payee boolean default false,
  livraison_non_encaissee boolean default false,
  frais_expedition numeric, frais_expedition_rembourse_at timestamptz);
-- La version du 11/09 : celle que la migration du 18/09 remplace. On la pose d'abord pour
-- vérifier que le remplacement fonctionne sur une base déjà en service, colonne comprise.
create or replace function public.montant_en_main_du_livreur(c public.colis)
returns numeric language sql immutable as $$
  select case when c.statut = 'livre' then coalesce(c.montant_article, 0) else 0 end
$$;
"""

# numero, statut, commune, article, livraison, livraison_payee, livraison_payee_non_livre,
# livraison_non_encaissee, article_non_encaisse, frais_expedition, attendu
CAS = [
    ("non livré, déplacement payé : la course est en main",
     'non_livre', 'Cocody', 9000, 1500, False, True, False, False, None, 1500),
    ("non livré, déplacement non payé : rien",
     'non_livre', 'Cocody', 9000, 1500, False, False, False, False, None, 0),
    ("livré, avec la case cochée : la règle ordinaire compte, une seule fois",
     'livre', 'Cocody', 9000, 1500, False, True, False, False, None, 10500),
    ("une expédition : le destinataire a payé chez la vendeuse, rien à encaisser",
     'non_livre', EXPEDITION, 9000, 1500, False, True, False, False, None, 0),
    ("déjà payée d'avance au dépôt : on ne paie pas deux fois la même course",
     'non_livre', 'Cocody', 9000, 1500, True, True, False, False, None, 0),
    ("retenté (« en livraison ») : l'argent reçu reste dans sa poche",
     'en_livraison', 'Cocody', 9000, 1500, False, True, False, False, None, 1500),
    ("rendu au bureau (« retour ») : de même",
     'retour', 'Cocody', 9000, 1500, False, True, False, False, None, 1500),
    ("une avance de gare se déduit, comme sur un colis livré (1 500 − 2 000)",
     'non_livre', 'Cocody', 9000, 1500, False, True, False, False, 2000, -500),
    ("un colis ancien, sans détail de montants : pas de course identifiable",
     'non_livre', 'Cocody', None, None, False, True, False, False, None, 0),
]


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

    print("\n1. La migration passe, et se rejoue sans rien casser")
    migration = open(MIGRATION, encoding="utf-8").read()
    code, s = psql(migration)
    verifier("elle passe sans erreur sur une base déjà en service", code == 0, s[-400:])
    code, s = psql(migration)
    verifier("elle se rejoue sans erreur", code == 0, s[-400:])
    code, s = psql("""select count(*) from information_schema.columns
                      where table_name='colis' and column_name='livraison_payee_non_livre';""")
    verifier("la colonne existe, une seule fois", s == "1", s)
    code, s = psql("""select is_nullable, column_default from information_schema.columns
                      where table_name='colis' and column_name='livraison_payee_non_livre';""")
    verifier("elle ne peut pas être nulle et vaut « non » par défaut", s == "NO|false", s)
    code, s = psql("""insert into public.colis (numero, statut) values ('CLT-TEMOIN', 'en_attente')
                      returning livraison_payee_non_livre;""")
    verifier("un colis créé sans rien dire n'a donc pas de course payée", s == "f", s)

    print("\n2. La règle SQL, cas par cas — les mêmes que le banc JavaScript")
    for (titre, statut, commune, art, liv, payee, sans_livraison,
         non_encaissee, solde, gare, attendu) in CAS:
        def v(x):
            return "null" if x is None else ("true" if x is True else ("false" if x is False else str(x)))
        psql("delete from public.colis where numero = 'CLT-CAS';")
        psql(f"""insert into public.colis (numero, statut, commune_destination, montant_article,
                   montant_livraison, livraison_payee, livraison_payee_non_livre,
                   livraison_non_encaissee, article_non_encaisse, frais_expedition)
                 values ('CLT-CAS', '{statut}', '{commune}', {v(art)}, {v(liv)}, {v(payee)},
                         {v(sans_livraison)}, {v(non_encaissee)}, {v(solde)}, {v(gare)});""")
        code, s = psql("""select public.montant_en_main_du_livreur(c) from public.colis c
                          where c.numero = 'CLT-CAS';""")
        verifier(titre, s == str(attendu), f"la base répond {s}, on attendait {attendu}")

    print("\n3. Ce que la migration ne touche pas")
    psql("delete from public.colis where numero = 'CLT-CAS';")
    code, s = psql("""insert into public.colis (numero, statut, commune_destination,
                        montant_article, montant_livraison)
                      values ('CLT-CAS', 'livre', 'Yopougon', 12000, 2000)
                      returning public.montant_en_main_du_livreur(colis.*);""")
    verifier("un colis livré ordinaire compte comme avant (12 000 + 2 000)", s == "14000", s)
    code, s = psql("""select count(*) from information_schema.columns where table_name='colis';""")
    verifier("une seule colonne a été ajoutée à la table (13 = les 12 du décor + elle)", s == "13", s)

    print(f"\n{reussies} réussie(s), {echouees} échouée(s).")
    return 1 if echouees else 0


if __name__ == "__main__":
    raise SystemExit(main())
