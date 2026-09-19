#!/usr/bin/env python3
"""
LES RETOURS DE MAIN EN MAIN — JOUÉS DANS UN VRAI POSTGRES — 20 septembre 2026
=============================================================================
Celtis, le 19 : « sur les colis retour, j'ai beaucoup de retours négatifs. Il faut un véritable
suivi pour qu'on sache exactement où c'est rentré. »

La migration 2026-09-20-les-retours-de-main-en-main.sql repose sur deux triggers et une RPC.
Un trigger qui se trompe ne dit rien à l'écran : il écrit une mauvaise ligne, ou n'en écrit
pas, et on s'en rend compte des semaines plus tard devant une cliente. On le joue donc ici,
geste par geste, sur un décor copié du vrai schéma (colonnes relevées le 19/09/2026), AVEC
quatre retours déjà en base pour vérifier la reprise de l'existant.

USAGE
  python3 tests/retours/essai-en-postgres.py
"""

import os, subprocess

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIGRATION = os.path.join(RACINE, "_sql-prive", "2026-09-20-les-retours-de-main-en-main.sql")
BASE = "essai_retours_clt"

reussies = echouees = 0


def verifier(titre, condition, detail=None):
    global reussies, echouees
    if condition:
        reussies += 1
        print("  ✅ " + titre)
    else:
        echouees += 1
        print("  ❌ " + titre + (("\n       → " + str(detail)[:500]) if detail is not None else ""))


def psql(sql, base=BASE):
    args = ["psql", "-q", "-v", "ON_ERROR_STOP=1", "-d", base, "-At", "-F", "|"]
    r = subprocess.run(["su", "postgres", "-c", " ".join(
        ["'" + a.replace("'", "'\\''") + "'" for a in args])],
        input=sql, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip()


LIVREUR  = "11111111-1111-1111-1111-111111111111"
LIVREUR2 = "22222222-2222-2222-2222-222222222222"
BUREAU   = "33333333-3333-3333-3333-333333333333"
CLIENTE  = "44444444-4444-4444-4444-444444444444"
AUTRE    = "55555555-5555-5555-5555-555555555555"

DECOR = f"""
create schema if not exists auth;
create table public.qui_parle (id uuid);
insert into public.qui_parle values (null);
create function auth.uid() returns uuid language sql stable as $$ select id from public.qui_parle limit 1 $$;
create function public.migration_appliquee(nom text, resume text) returns text
  language sql as $$ select 'enregistrée : ' || nom $$;
create table public.profiles (id uuid primary key, role text, status text default 'valide', acces_operations boolean default false);
insert into public.profiles values
  ('{LIVREUR}','livreur','valide',false), ('{LIVREUR2}','livreur','valide',false),
  ('{BUREAU}','equipe','valide',true), ('{CLIENTE}','fournisseur','valide',false), ('{AUTRE}','fournisseur','valide',false);
create function public.is_equipe() returns boolean language sql stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('equipe','admin')) $$;
create function public.is_livreur() returns boolean language sql stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'livreur') $$;
create function public.a_acces_operations() returns boolean language sql stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and (role = 'admin' or acces_operations)) $$;
create table public.colis (
  id uuid primary key default gen_random_uuid(), numero text, statut text,
  fournisseur_id uuid, livreur_id uuid, livreur_collecte_id uuid,
  motif_non_livraison text, updated_at timestamptz default now(),
  non_livre_at timestamptz, retour_at timestamptz, retour_rendu_at timestamptz, retour_rendu_par uuid);
-- Le trigger d'horodatage du 17/09, tel qu'il est en base : retour_at se pose à l'entrée en retour.
create function public.colis_touch_horodatages() returns trigger language plpgsql as $$
begin
  if new.statut = 'retour' and (old.statut is distinct from 'retour') then new.retour_at := now(); end if;
  if new.statut = 'non_livre' and (old.statut is distinct from 'non_livre') then new.non_livre_at := now(); end if;
  return new;
end $$;
create trigger colis_touch_horodatages before update on public.colis for each row execute function public.colis_touch_horodatages();
create table public.reclamations_clientes (
  id uuid primary key default gen_random_uuid(), fournisseur_id uuid not null, colis_id uuid,
  motif text not null, texte text, statut text not null default 'ouverte', created_at timestamptz default now());

-- QUATRE RETOURS DÉJÀ EN BASE, comme en production avant la migration.
insert into public.colis (id, numero, statut, fournisseur_id, livreur_id, motif_non_livraison, retour_at, retour_rendu_at, retour_rendu_par) values
  ('aaaaaaaa-0000-0000-0000-000000000001','R-1','retour','{CLIENTE}','{LIVREUR}','client_absent', now() - interval '5 days', null, null),
  ('aaaaaaaa-0000-0000-0000-000000000002','R-2','retour','{CLIENTE}','{LIVREUR}','refus_client', now() - interval '3 days', now() - interval '2 days', '{LIVREUR}'),
  ('aaaaaaaa-0000-0000-0000-000000000003','R-3','retour','{CLIENTE}',null,null, null, null, null),
  ('aaaaaaaa-0000-0000-0000-000000000004','L-4','livre','{CLIENTE}','{LIVREUR}',null, null, null, null);
"""

def parler(qui):
    return f"update public.qui_parle set id = {('null' if qui is None else repr(qui) + '::uuid')};"

def main():
    psql(f"drop database if exists {BASE};", base="postgres")
    psql("drop role if exists lecteur_essai;", base="postgres")
    code, out = psql(f"create database {BASE};", base="postgres")
    assert code == 0, out
    code, out = psql(DECOR)
    assert code == 0, out

    print("\nLa migration se joue sur une base qui a déjà des retours")
    with open(MIGRATION, encoding="utf-8") as f:
        sql = f.read()
    code, out = psql(sql)
    verifier("la migration passe sans erreur", code == 0, out)
    code, out = psql(sql)
    verifier("et se rejoue sans erreur (idempotente)", code == 0, out)

    print("\nReprise de l'existant")
    code, out = psql("select numero||':'||coalesce(retour_detenteur,'-')||':'||coalesce(retour_detenteur_livreur_id::text,'-') from public.colis order by numero;")
    verifier("R-1 non rendu → chez son livreur", f"R-1:livreur:{LIVREUR}" in out, out)
    verifier("R-2 rendu le 18 → cliente", "R-2:cliente:-" in out, out)
    verifier("R-3 sans livreur → détenteur livreur, sans nom", "R-3:livreur:-" in out, out)
    verifier("L-4 livré → rien", "L-4:-:-" in out, out)
    code, out = psql("select count(*) from public.retours_mouvements where geste='declare' and note like 'Reconstitu%';")
    verifier("trois lignes « déclaré » reconstituées", out == "3", out)
    code, out = psql("select count(*) from public.retours_mouvements where geste='rendu_cliente' and colis_id='aaaaaaaa-0000-0000-0000-000000000002';")
    verifier("R-2 a sa ligne « rendu » datée d'il y a deux jours", out == "1", out)
    code, out = psql("select (at < now() - interval '4 days') from public.retours_mouvements where geste='declare' and colis_id='aaaaaaaa-0000-0000-0000-000000000001';")
    verifier("la ligne reconstituée porte la date du retour, pas celle d'aujourd'hui", out == "t", out)
    code, out = psql("select count(*) from public.retours_mouvements where motif='client_absent';")
    verifier("le motif de l'échec est repris dans le journal", out == "1", out)

    print("\nLe livreur passe un colis en retour (menu déroulant, comme avant)")
    psql(f"insert into public.colis (id, numero, statut, fournisseur_id, livreur_id) values ('bbbbbbbb-0000-0000-0000-000000000001','N-1','en_livraison','{CLIENTE}','{LIVREUR}');")
    code, out = psql(parler(LIVREUR) + "update public.colis set statut='retour', motif_non_livraison='mauvais_numero' where numero='N-1'; "
                     "select retour_detenteur||':'||retour_detenteur_livreur_id::text||':'||(retour_at is not null)::text from public.colis where numero='N-1';")
    verifier("détenteur = livreur, son nom, retour_at posé", out == f"livreur:{LIVREUR}:true", out)
    code, out = psql("select geste||':'||coalesce(par::text,'-')||':'||coalesce(par_role,'-')||':'||coalesce(motif,'-') from public.retours_mouvements where colis_id='bbbbbbbb-0000-0000-0000-000000000001';")
    verifier("journal : déclaré, par le livreur, avec le motif", out == f"declare:{LIVREUR}:livreur:mauvais_numero", out)

    print("\nLe livreur le dépose au bureau, le bureau le confie à un autre livreur")
    code, out = psql(parler(LIVREUR) + "update public.colis set retour_detenteur='bureau' where numero='N-1'; select retour_detenteur||':'||coalesce(retour_detenteur_livreur_id::text,'-') from public.colis where numero='N-1';")
    verifier("au bureau, plus aucun livreur détenteur", out == "bureau:-", out)
    code, out = psql(parler(BUREAU) + f"update public.colis set retour_detenteur='livreur', retour_detenteur_livreur_id='{LIVREUR2}' where numero='N-1'; select retour_detenteur||':'||retour_detenteur_livreur_id::text from public.colis where numero='N-1';")
    verifier("confié au second livreur", out == f"livreur:{LIVREUR2}", out)
    code, out = psql("select string_agg(geste||'@'||coalesce(par_role,'-'), ',' order by at) from public.retours_mouvements where colis_id='bbbbbbbb-0000-0000-0000-000000000001';")
    verifier("journal : déclaré → déposé au bureau → confié (par l'équipe)", out == "declare@livreur,depose_bureau@livreur,confie_livreur@equipe", out)

    print("\nLe second livreur le rend à la cliente, avec photo")
    code, out = psql(parler(LIVREUR2) + f"update public.colis set retour_detenteur='cliente', retour_rendu_at=now(), retour_rendu_par='{LIVREUR2}', retour_rendu_photo_url='https://x/photo.jpg' where numero='N-1'; "
                     "select retour_detenteur||':'||coalesce(retour_detenteur_livreur_id::text,'-')||':'||(retour_rendu_at is not null)::text from public.colis where numero='N-1';")
    verifier("rendu : détenteur cliente, date posée", out == "cliente:-:true", out)
    code, out = psql("select photo_url from public.retours_mouvements where geste='rendu_cliente' and colis_id='bbbbbbbb-0000-0000-0000-000000000001';")
    verifier("la photo de la remise est dans le journal", out == "https://x/photo.jpg", out)

    print("\nLa cliente répond")
    code, out = psql(parler(AUTRE) + "select public.cliente_repond_au_retour('bbbbbbbb-0000-0000-0000-000000000001', true);")
    verifier("une autre cliente ne peut pas répondre à sa place", code != 0 and "pas à vous" in out, out)
    code, out = psql(parler(CLIENTE) + "select public.cliente_repond_au_retour('aaaaaaaa-0000-0000-0000-000000000001', true);")
    verifier("on ne confirme pas un colis encore chez le livreur", code != 0 and "rien à confirmer" in out, out)
    code, out = psql(parler(CLIENTE) + "select public.cliente_repond_au_retour('bbbbbbbb-0000-0000-0000-000000000001', true); select (retour_confirme_at is not null)::text from public.colis where numero='N-1';")
    verifier("« bien récupéré » : confirmé", out.endswith("true") and '"recu": true' in out, out)
    code, out = psql("select count(*) from public.retours_mouvements where geste='confirme_cliente' and par_role='fournisseur';")
    verifier("journal : confirmé par la cliente", out == "1", out)
    code, out = psql(parler(CLIENTE) + "select public.cliente_repond_au_retour('bbbbbbbb-0000-0000-0000-000000000001', true);")
    verifier("reconfirmer ne fait rien (déjà)", '"deja": true' in out, out)

    print("\nUne autre cliente dit NON")
    psql(parler(LIVREUR) + f"update public.colis set retour_detenteur='cliente' where numero='R-1';")
    code, out = psql("select (retour_rendu_at is not null)::text||':'||coalesce(retour_rendu_par::text,'-') from public.colis where numero='R-1';")
    verifier("rendu sans date : la date et l'auteur se posent tout seuls", out == f"true:{LIVREUR}", out)
    code, out = psql(parler(CLIENTE) + "select public.cliente_repond_au_retour('aaaaaaaa-0000-0000-0000-000000000001', false, 'Le livreur ne m''a rien rapporté'); "
                     "select retour_detenteur||':'||(retour_conteste_at is not null)::text||':'||retour_conteste_texte from public.colis where numero='R-1';")
    verifier("« je ne l'ai pas » : litige, daté, avec son texte", out.endswith("litige:true:Le livreur ne m'a rien rapporté"), out)
    code, out = psql("select motif||':'||statut||':'||fournisseur_id::text from public.reclamations_clientes;")
    verifier("une réclamation « retour jamais rendu » s'ouvre pour le bureau", out == f"retour_pas_rendu:ouverte:{CLIENTE}", out)
    code, out = psql("select note from public.retours_mouvements where geste='conteste_cliente';")
    verifier("journal : contesté, avec ce qu'elle a écrit", out == "Le livreur ne m'a rien rapporté", out)

    print("\nLe bureau reprend le litige")
    code, out = psql(parler(BUREAU) + f"update public.colis set retour_detenteur='livreur', retour_detenteur_livreur_id='{LIVREUR}' where numero='R-1'; "
                     "select retour_detenteur||':'||coalesce(retour_rendu_at::text,'-')||':'||coalesce(retour_conteste_at::text,'-') from public.colis where numero='R-1';")
    verifier("reconfié au livreur : plus de « rendu », plus de litige", out == "livreur:-:-", out)
    code, out = psql(parler(BUREAU) + "update public.colis set retour_detenteur='cliente' where numero='R-1'; select retour_detenteur||':'||(retour_rendu_at is not null)::text||':'||retour_rendu_par::text from public.colis where numero='R-1';")
    verifier("le bureau rend lui-même : rendu, daté, signé du bureau", out == f"cliente:true:{BUREAU}", out)

    print("\nLe bureau corrige un « rendu » qui ne l'était pas")
    code, out = psql(parler(BUREAU) + "update public.colis set retour_detenteur='bureau' where numero='R-2'; select retour_detenteur||':'||coalesce(retour_rendu_at::text,'-') from public.colis where numero='R-2';")
    verifier("de « cliente » à « bureau » : la date de remise s'efface", out == "bureau:-", out)

    print("\nLe colis repart en livraison")
    code, out = psql(parler(BUREAU) + "update public.colis set statut='en_livraison' where numero='R-2'; select coalesce(retour_detenteur,'-')||':'||coalesce(retour_rendu_at::text,'-') from public.colis where numero='R-2';")
    verifier("plus de détenteur ni de remise : un futur retour repart propre", out == "-:-", out)
    code, out = psql("select geste||':'||note from public.retours_mouvements where colis_id='aaaaaaaa-0000-0000-0000-000000000002' order by at desc limit 1;")
    verifier("journal : « relance », avec le nouveau statut", out == "relance:Reparti : en_livraison", out)
    code, out = psql("select count(*) from public.retours_mouvements where colis_id='aaaaaaaa-0000-0000-0000-000000000002';")
    verifier("l'histoire précédente est gardée (reprise, rendu, correction, relance)", out == "4", out)
    code, out = psql(parler(LIVREUR) + "update public.colis set statut='retour' where numero='R-2'; select retour_detenteur||':'||(retour_at > now() - interval '1 minute')::text from public.colis where numero='R-2';")
    verifier("il revient une seconde fois : chez le livreur, nouvelle date", out == "livreur:true", out)

    print("\nUne ancienne version de l'application (statut + retour_rendu_at en un coup)")
    psql(f"insert into public.colis (id, numero, statut, fournisseur_id, livreur_id) values ('cccccccc-0000-0000-0000-000000000001','V-1','en_livraison','{CLIENTE}','{LIVREUR}');")
    code, out = psql(parler(LIVREUR) + f"update public.colis set statut='retour', retour_rendu_at=now(), retour_rendu_par='{LIVREUR}' where numero='V-1'; select retour_detenteur from public.colis where numero='V-1';")
    verifier("comprise comme « rendu à la cliente »", out == "cliente", out)
    code, out = psql("select string_agg(geste, ',' order by at, geste) from public.retours_mouvements where colis_id='cccccccc-0000-0000-0000-000000000001';")
    verifier("journal : déclaré puis rendu", out == "declare,rendu_cliente", out)

    print("\nQui lit le journal")
    code, out = psql("alter table public.retours_mouvements force row level security; "
                     "create role lecteur_essai in role authenticated; grant select on public.retours_mouvements, public.colis, public.profiles, public.qui_parle to lecteur_essai; grant usage on schema public, auth to lecteur_essai; grant execute on all functions in schema public to lecteur_essai; grant execute on all functions in schema auth to lecteur_essai;")
    assert code == 0, out
    code, out = psql(parler(CLIENTE) + "set role lecteur_essai; select count(*) from public.retours_mouvements;")
    verifier("la cliente voit les lignes de SES colis", out == psql("select count(*) from public.retours_mouvements m join public.colis c on c.id=m.colis_id where c.fournisseur_id='" + CLIENTE + "';")[1], out)
    code, out = psql(parler(AUTRE) + "set role lecteur_essai; select count(*) from public.retours_mouvements;")
    verifier("une autre cliente ne voit rien", out == "0", out)
    code, out = psql(parler(LIVREUR2) + "set role lecteur_essai; select count(distinct colis_id) from public.retours_mouvements;")
    verifier("le second livreur ne voit que le colis qu'il a détenu", out == "1", out)
    code, out = psql(parler(BUREAU) + "set role lecteur_essai; select count(*) from public.retours_mouvements;")
    verifier("le bureau voit tout", out == psql("select count(*) from public.retours_mouvements;")[1], out)
    code, out = psql(parler(BUREAU) + "set role lecteur_essai; insert into public.retours_mouvements (colis_id, geste) values ('bbbbbbbb-0000-0000-0000-000000000001','declare');")
    verifier("personne n'écrit le journal à la main", code != 0, out)

    print("\nLe livreur à qui le bureau confie un colis revenu le voit et peut le rendre")
    code, out = psql(f"""
      reset role;
      insert into public.colis (id, numero, statut, fournisseur_id, livreur_id) values ('dddddddd-0000-0000-0000-000000000001','P-1','en_livraison','{CLIENTE}','{LIVREUR}');
      {parler(LIVREUR)} update public.colis set statut='retour' where numero='P-1';
      {parler(BUREAU)} update public.colis set retour_detenteur='bureau' where numero='P-1';
      update public.colis set retour_detenteur='livreur', retour_detenteur_livreur_id='{LIVREUR2}' where numero='P-1';
      alter table public.colis enable row level security; alter table public.colis force row level security;
      create policy colis_select_livreur on public.colis for select using (public.is_livreur() and (livreur_id = auth.uid() or livreur_collecte_id = auth.uid()));
      create policy colis_update_livreur on public.colis for update using (public.is_livreur() and livreur_id = auth.uid()) with check (public.is_livreur() and livreur_id = auth.uid());
      grant update on public.colis to lecteur_essai; grant insert on public.retours_mouvements, public.reclamations_clientes to lecteur_essai;""")
    assert code == 0, out
    code, out = psql(parler(LIVREUR2) + "set role lecteur_essai; select numero from public.colis;")
    verifier("le second livreur voit le colis confié, et celui qu'il a rendu plus tôt — pas les autres", out == "N-1\nP-1", out)
    code, out = psql(parler(LIVREUR2) + "set role lecteur_essai; update public.colis set statut='livre' where numero='P-1';")
    verifier("mais il ne peut pas en faire un colis « livré » : seul le retour est entre ses mains", code != 0, out)
    code, out = psql("reset role; select statut from public.colis where numero='P-1';")
    verifier("… le statut n'a pas bougé", out == "retour", out)
    code, out = psql(parler(LIVREUR2) + f"set role lecteur_essai; update public.colis set retour_detenteur='cliente', retour_rendu_at=now(), retour_rendu_par='{LIVREUR2}' where numero='P-1'; reset role; select retour_detenteur||':'||coalesce(retour_detenteur_livreur_id::text,'-') from public.colis where numero='P-1';")
    verifier("il peut le rendre à la cliente", code == 0 and out == "cliente:-", out)
    code, out = psql(parler(LIVREUR) + "set role lecteur_essai; select count(*) from public.colis where numero='P-1';")
    verifier("le livreur d'origine le voit toujours (l'échec reste le sien)", out == "1", out)

    psql(f"drop database if exists {BASE};", base="postgres")
    psql("drop role if exists lecteur_essai;", base="postgres")
    print(f"\n{reussies} réussies, {echouees} échouées")
    raise SystemExit(1 if echouees else 0)


if __name__ == "__main__":
    main()
