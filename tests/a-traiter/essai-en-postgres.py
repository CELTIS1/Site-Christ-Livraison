#!/usr/bin/env python3
"""
LE CENTRE « À TRAITER », JOUÉ DANS UN VRAI POSTGRES (20/09/2026, point 20.B)
===========================================================================================
« L'essentiel » comptait sur les 500 colis chargés dans la page. Cet essai monte un décor
avec les mêmes colonnes que la production, joue la migration, et vérifie que
essentiel_compteurs() compte exactement comme les écrans (lib/argent.js, lib/retours.js) :
un colis par cas, et le cas qui ne doit PAS compter à côté.

USAGE
  python3 tests/a-traiter/essai-en-postgres.py
"""
import json, os, subprocess, sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIGRATION = os.path.join(RACINE, "_sql-prive", "2026-09-20-le-centre-a-traiter.sql")
BASE = "essai_a_traiter_clt"
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
CLIENTE = "44444444-4444-4444-4444-444444444444"
AUTRE = "55555555-5555-5555-5555-555555555555"

DECOR = f"""
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if; end $$;
create schema if not exists auth;
create table public.qui_parle (id uuid); insert into public.qui_parle values (null);
create function auth.uid() returns uuid language sql stable as $$ select id from public.qui_parle limit 1 $$;
create function public.migration_appliquee(nom text, resume text) returns text language sql as $$ select nom $$;
create table public.profiles (id uuid primary key, role text, status text default 'valide', suppression_demandee_at timestamptz);
insert into public.profiles (id, role) values ('{BUREAU}','equipe'), ('{LIVREUR}','livreur'), ('{CLIENTE}','fournisseur'), ('{AUTRE}','fournisseur');
create table public.colis (
  id uuid primary key default gen_random_uuid(), numero text, statut text, fournisseur_id uuid, livreur_id uuid, livreur_collecte_id uuid,
  montant numeric, montant_article numeric, montant_livraison numeric, article_non_encaisse boolean, reverse_au_fournisseur_at timestamptz,
  encaissement_remis boolean, reporte_au date, created_at timestamptz default now(), non_livre_at timestamptz, retour_at timestamptz,
  retour_detenteur text, retour_rendu_at timestamptz, echec_imputable boolean, frais_additionnels_montant numeric, frais_additionnels_regle_at timestamptz);
create table public.reclamations_clientes (id uuid primary key default gen_random_uuid(), fournisseur_id uuid, statut text default 'ouverte', created_at timestamptz default now());
create table public.demandes_de_passage (id uuid primary key default gen_random_uuid(), jour date, fournisseur_id uuid, statut text default 'en_attente'
  check (statut in ('en_attente','traitee','annulee')), motif text);
alter table public.demandes_de_passage drop constraint demandes_de_passage_statut_check;
alter table public.demandes_de_passage add constraint demandes_de_passage_statut_check check (statut in ('en_attente','traitee','annulee'));

insert into public.colis (numero, statut, livreur_id, livreur_collecte_id, montant_article, montant_livraison, created_at, reporte_au, non_livre_at, retour_at, retour_detenteur, retour_rendu_at, encaissement_remis, echec_imputable, frais_additionnels_montant, frais_additionnels_regle_at, montant, article_non_encaisse, reverse_au_fournisseur_at) values
  ('SANS-LIVREUR', 'en_attente', null, null, 5000, 1500, now(), null, null, null, null, null, false, null, null, null, null, null, null),
  ('LIVRE-SANS-LIVREUR', 'livre', null, null, 5000, 1500, now() - interval '30 days', null, null, null, null, null, true, null, null, null, null, null, null),
  ('MONTANT-MANQUANT', 'en_attente', '{LIVREUR}', '{LIVREUR}', null, 1500, now(), null, null, null, null, null, false, null, null, null, null, null, null),
  ('ARTICLE-SOLDE', 'en_attente', '{LIVREUR}', '{LIVREUR}', null, 1500, now(), null, null, null, null, null, false, null, null, null, null, true, null),
  ('ANCIEN-SANS-DETAIL', 'livre', '{LIVREUR}', '{LIVREUR}', null, null, now() - interval '60 days', null, null, null, null, null, true, null, null, null, 4000, null, null),
  ('A-CONFIER-LIVRAISON', 'recupere', null, '{LIVREUR}', 5000, 1500, now(), null, null, null, null, null, false, null, null, null, null, null, null),
  ('RETARD', 'en_livraison', '{LIVREUR}', '{LIVREUR}', 5000, 1500, now() - interval '1 day', null, null, null, null, null, false, null, null, null, null, null, null),
  ('REPORTE-A-DEMAIN', 'en_livraison', '{LIVREUR}', '{LIVREUR}', 5000, 1500, now() - interval '1 day', (now() at time zone 'Africa/Abidjan')::date + 1, null, null, null, null, false, null, null, null, null, null, null),
  ('DORMANT', 'recupere', '{LIVREUR}', '{LIVREUR}', 5000, 1500, now() - interval '5 days', null, null, null, null, null, false, null, null, null, null, null, null),
  ('NON-LIVRE-A-EXAMINER', 'non_livre', '{LIVREUR}', '{LIVREUR}', 5000, 1500, now(), null, now(), null, null, null, false, null, null, null, null, null, null),
  ('RETOUR-CHEZ-LIVREUR-TARD', 'retour', '{LIVREUR}', '{LIVREUR}', 5000, 1500, now() - interval '6 days', null, now() - interval '5 days', now() - interval '5 days', 'livreur', null, false, null, null, null, null, null, null),
  ('RETOUR-LITIGE', 'retour', '{LIVREUR}', '{LIVREUR}', 5000, 1500, now() - interval '3 days', null, now() - interval '2 days', now() - interval '1 days', 'litige', now(), false, null, null, null, null, null, null),
  ('RETOUR-RENDU', 'retour', '{LIVREUR}', '{LIVREUR}', 5000, 1500, now() - interval '3 days', null, now() - interval '2 days', now() - interval '1 days', 'cliente', now(), false, null, null, null, null, null, null),
  ('A-SOLDER', 'livre', '{LIVREUR}', '{LIVREUR}', 20000, 1500, now() - interval '40 days', null, null, null, null, null, false, null, null, null, null, null, null),
  ('FRAIS-ADD', 'livre', '{LIVREUR}', '{LIVREUR}', 5000, 1500, now() - interval '2 days', null, null, null, null, null, true, null, 700, null, null, null, null);
insert into public.reclamations_clientes (fournisseur_id, statut, created_at) values ('{CLIENTE}', 'ouverte', now() - interval '5 days'), ('{CLIENTE}', 'en_cours', now()), ('{AUTRE}', 'resolue', now());
insert into public.demandes_de_passage (jour, fournisseur_id, statut) values ((now() at time zone 'Africa/Abidjan')::date + 1, '{CLIENTE}', 'en_attente'), ((now() at time zone 'Africa/Abidjan')::date - 1, '{AUTRE}', 'en_attente');
update public.profiles set suppression_demandee_at = now() where id = '{AUTRE}';
create role testeur_at in role authenticated; grant usage on schema public, auth to testeur_at; grant select, update on public.qui_parle to testeur_at;
"""


def parler(qui):
    return f"update public.qui_parle set id = {('null' if qui is None else repr(qui) + '::uuid')};"


def main():
    if not os.path.exists(MIGRATION):
        print("⏭️  migration absente (dossier privé, hors dépôt) : essai sauté."); return 0
    subprocess.run(["service", "postgresql", "start"], capture_output=True)
    psql(f"drop database if exists {BASE};", base="postgres"); psql("drop role if exists testeur_at;", base="postgres")
    code, out = psql(f"create database {BASE};", base="postgres")
    if code != 0:
        print("⏭️  Postgres n'est pas joignable : essai sauté.\n   " + out[:200]); return 0
    code, out = psql(DECOR)
    if code != 0:
        print("❌ Le décor ne se monte pas :\n" + out[-800:]); return 1

    print("\n1. La migration")
    sql = open(MIGRATION, encoding="utf-8").read()
    code, out = psql(sql); verifier("elle passe", code == 0, out[-500:])
    code, out = psql(sql); verifier("elle se rejoue", code == 0, out[-300:])
    code, out = psql("insert into public.demandes_de_passage (jour, fournisseur_id, statut, motif_refus) values (current_date + 3, '" + CLIENTE + "', 'refusee', 'Pas de livreur ce jour-là') returning statut;")
    verifier("une demande de passage peut être refusée, avec un motif", out == "refusee", out)

    print("\n2. Les compteurs, par la base, avec les règles des écrans")
    code, out = psql(parler(BUREAU) + " set role testeur_at; select public.essentiel_compteurs()::text;")
    verifier("l'équipe obtient les compteurs", code == 0, out[-300:])
    try:
        r = json.loads(out)
    except Exception:
        r = {}
    def noms(cle):
        ids = r.get(cle) or []
        code, out = psql("select string_agg(numero, ',' order by numero) from public.colis where id in (" + (",".join("'" + i + "'" for i in ids) or "'00000000-0000-0000-0000-000000000000'") + ");")
        return out
    verifier("sans livreur : le colis en attente, pas le livré d'avant l'application", noms('sans_livreur') == "A-CONFIER-LIVRAISON,SANS-LIVREUR", noms('sans_livreur'))
    verifier("montant manquant : oui pour le vide, non pour « article soldé », non pour l'ancien sans détail", noms('montant_manquant') == "MONTANT-MANQUANT", noms('montant_manquant'))
    verifier("à confier en collecte / en livraison", noms('collecte') == "SANS-LIVREUR" and noms('livraison') == "A-CONFIER-LIVRAISON", noms('collecte') + ' / ' + noms('livraison'))
    verifier("en livraison depuis hier : oui, sauf s'il est reporté à demain", noms('retard') == "RETARD", noms('retard'))
    verifier("dormant : récupéré depuis plus de deux jours", noms('dormants') == "DORMANT", noms('dormants'))
    verifier("à examiner : les non livrés / retours pas encore vus", noms('examiner') == "NON-LIVRE-A-EXAMINER,RETOUR-CHEZ-LIVREUR-TARD,RETOUR-LITIGE,RETOUR-RENDU", noms('examiner'))
    verifier("retours détenus : livreur et litige, pas celui rendu à la cliente", noms('retours') == "RETOUR-CHEZ-LIVREUR-TARD,RETOUR-LITIGE", noms('retours'))
    verifier("retours en retard : celui de 5 jours seulement", noms('retours_tard') == "RETOUR-CHEZ-LIVREUR-TARD", noms('retours_tard'))
    verifier("litiges : la cliente a dit non", noms('litiges') == "RETOUR-LITIGE", noms('litiges'))
    verifier("frais additionnels non réglés", noms('frais_additionnels') == "FRAIS-ADD", noms('frais_additionnels'))
    verifier("à solder : 1 colis livré non remis, 21 500 F (article + livraison)", r.get('a_solder') == 1 and float(r.get('reste_a_remettre', 0)) == 21500, str(r.get('a_solder')) + ' / ' + str(r.get('reste_a_remettre')))
    verifier("réclamations : 2 ouvertes, 1 qui traîne", r.get('reclamations') == 2 and r.get('reclamations_tard') == 1, str(r.get('reclamations')) + '/' + str(r.get('reclamations_tard')))
    verifier("demandes de passage : 1 à venir (la passée ne compte plus)", r.get('demandes_passage') == 1, str(r.get('demandes_passage')))
    verifier("suppressions demandées : 1", r.get('suppressions') == 1, str(r.get('suppressions')))

    print("\n3. « Examiné » est un fait partagé")
    psql("update public.colis set vu_par_bureau_at = now() where numero = 'NON-LIVRE-A-EXAMINER';")
    code, out = psql(parler(BUREAU) + " set role testeur_at; select jsonb_array_length(public.essentiel_compteurs()->'examiner');")
    verifier("une fois vu, il sort de la pastille — pour tous les postes", out == "3", out)

    print("\n4. Réservé à l'équipe")
    code, out = psql(parler(CLIENTE) + " set role testeur_at; select public.essentiel_compteurs();")
    verifier("une cliente : refusée", code != 0 and "reserve_a_l_equipe" in out, out[-200:])

    psql(f"drop database if exists {BASE};", base="postgres"); psql("drop role if exists testeur_at;", base="postgres")
    print(f"\n{reussies} réussie(s), {echouees} échouée(s).")
    return 1 if echouees else 0


if __name__ == "__main__":
    sys.exit(main())
