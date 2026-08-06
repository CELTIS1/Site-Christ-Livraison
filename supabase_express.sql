-- ============================================================================
-- CLT Express — Marketplace grand public (clients & coursiers indépendants)
-- ============================================================================
-- À exécuter UNE SEULE FOIS dans Supabase : Dashboard > SQL Editor > New query
-- (copier-coller tout ce fichier, puis cliquer sur "Run").
--
-- Ce script est indépendant de l'application interne équipe/livreur/fournisseur
-- existante : il ajoute deux nouveaux rôles ('client_express' et
-- 'coursier_express') et une table de courses séparée de "colis". Aucune
-- donnée ni règle existante n'est modifiée.
--
-- Contenu :
--   1. Deux colonnes ajoutées à "profiles" (disponibilité coursier + pièce
--      d'identité) — sans impact sur les rôles existants.
--   2. "express_config" : grille tarifaire (modifiable par l'équipe/admin).
--   3. "express_courses" : les demandes de livraison grand public, avec
--      calcul automatique de la distance et du prix.
--   4. Politiques de sécurité (RLS) : un client ne voit que ses courses, un
--      coursier voit les courses disponibles + les siennes, l'équipe/admin
--      voit tout.
--   5. Diffusion en temps réel (Realtime) pour que les coursiers voient
--      apparaître les nouvelles demandes sans recharger la page.
--   6. Un espace de stockage (Storage) privé pour la pièce d'identité
--      envoyée par le coursier lors de son inscription.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Colonnes ajoutées à profiles (utilisées uniquement par le rôle
--    'coursier_express' ; ignorées pour tous les autres rôles).
-- ----------------------------------------------------------------------------

alter table public.profiles add column if not exists disponible_express boolean not null default false;
comment on column public.profiles.disponible_express is
  'Coursier CLT Express uniquement : true quand le coursier a activé "Je suis disponible" depuis son espace, pour voir et accepter des courses.';

alter table public.profiles add column if not exists piece_identite_path text;
comment on column public.profiles.piece_identite_path is
  'Coursier CLT Express uniquement : chemin (dans le bucket privé "express-kyc") de la pièce d''identité envoyée à l''inscription, consultée par l''équipe/admin pour valider le compte.';


-- ----------------------------------------------------------------------------
-- 2. express_config — grille tarifaire (une seule ligne, modifiable par
--    l'équipe/admin depuis Supabase ou, plus tard, depuis un écran dédié).
-- ----------------------------------------------------------------------------

create table if not exists public.express_config (
  id smallint primary key default 1,
  tarif_base numeric not null default 500,
  tarif_par_km numeric not null default 150,
  commission_pct numeric not null default 0.15,
  updated_at timestamptz not null default now(),
  constraint express_config_singleton check (id = 1)
);

comment on table public.express_config is
  'Grille tarifaire CLT Express (ligne unique, id=1). tarif_base et tarif_par_km sont en francs CFA. commission_pct est la part reversée à CLT Express (0.15 = 15%), le reste revenant au coursier. Le client payant en espèces directement au coursier, le coursier doit ensuite reverser la commission à CLT Express (voir commission_reglee sur express_courses).';

insert into public.express_config (id) values (1) on conflict (id) do nothing;

alter table public.express_config enable row level security;

drop policy if exists "Lecture de la grille tarifaire par les comptes connectes" on public.express_config;
create policy "Lecture de la grille tarifaire par les comptes connectes"
on public.express_config for select
to authenticated
using (true);

drop policy if exists "Modification de la grille tarifaire par equipe et admin" on public.express_config;
create policy "Modification de la grille tarifaire par equipe et admin"
on public.express_config for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
    and profiles.role in ('equipe', 'admin')
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
    and profiles.role in ('equipe', 'admin')
  )
);


-- ----------------------------------------------------------------------------
-- 3. express_courses — les demandes de livraison grand public.
-- ----------------------------------------------------------------------------

create table if not exists public.express_courses (
  id uuid primary key default gen_random_uuid(),

  client_id uuid not null references public.profiles(id) on delete cascade,
  coursier_id uuid references public.profiles(id) on delete set null,

  status text not null default 'en_attente', -- 'en_attente' | 'acceptee' | 'livree' | 'annulee'

  description_colis text,

  adresse_recuperation text not null,
  latitude_recuperation double precision,
  longitude_recuperation double precision,

  adresse_livraison text not null,
  latitude_livraison double precision,
  longitude_livraison double precision,

  destinataire_nom text,
  destinataire_telephone text,

  distance_km numeric,
  prix_total numeric,
  commission_montant numeric,
  montant_coursier numeric,
  commission_reglee boolean not null default false,

  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz
);

comment on table public.express_courses is
  'Demandes de livraison du grand public (CLT Express), séparées des colis internes ("colis"). Une course passe par en_attente -> acceptee -> livree, ou annulee à tout moment tant qu''elle est en_attente. distance_km, prix_total, commission_montant et montant_coursier sont calculés automatiquement à la création (voir trigger express_calculer_prix).';

comment on column public.express_courses.commission_reglee is
  'Le client paie le coursier en espèces à la livraison ; le coursier doit ensuite reverser la commission (commission_montant) à CLT Express séparément. Ce champ, coché par l''équipe/admin une fois le versement reçu, sert au suivi — il n''affecte pas le statut de la course.';

-- Calcule automatiquement la distance (à vol d'oiseau, formule de haversine)
-- et le prix à partir de la grille tarifaire, dès que les coordonnées de
-- récupération et de livraison sont fournies.
create or replace function public.express_calculer_prix()
returns trigger
language plpgsql
as $$
declare
  cfg record;
  rayon_terre double precision := 6371; -- km
  dlat double precision;
  dlon double precision;
  a double precision;
begin
  select * into cfg from public.express_config where id = 1;

  if new.latitude_recuperation is not null and new.longitude_recuperation is not null
     and new.latitude_livraison is not null and new.longitude_livraison is not null then
    dlat := radians(new.latitude_livraison - new.latitude_recuperation);
    dlon := radians(new.longitude_livraison - new.longitude_recuperation);
    a := sin(dlat / 2) ^ 2
       + cos(radians(new.latitude_recuperation)) * cos(radians(new.latitude_livraison)) * sin(dlon / 2) ^ 2;
    new.distance_km := round((rayon_terre * 2 * asin(sqrt(a)))::numeric, 2);
  end if;

  if new.distance_km is not null and cfg is not null then
    new.prix_total := round(cfg.tarif_base + (cfg.tarif_par_km * new.distance_km));
    new.commission_montant := round(new.prix_total * cfg.commission_pct);
    new.montant_coursier := new.prix_total - new.commission_montant;
  end if;

  return new;
end;
$$;

drop trigger if exists express_courses_calcul_prix on public.express_courses;
create trigger express_courses_calcul_prix
before insert on public.express_courses
for each row execute function public.express_calculer_prix();

create index if not exists express_courses_status_idx on public.express_courses(status);
create index if not exists express_courses_client_id_idx on public.express_courses(client_id);
create index if not exists express_courses_coursier_id_idx on public.express_courses(coursier_id);

alter table public.express_courses enable row level security;

-- Le client voit et crée ses propres courses.
drop policy if exists "Client voit ses propres courses" on public.express_courses;
create policy "Client voit ses propres courses"
on public.express_courses for select
to authenticated
using (auth.uid() = client_id);

drop policy if exists "Client cree ses propres courses" on public.express_courses;
create policy "Client cree ses propres courses"
on public.express_courses for insert
to authenticated
with check (auth.uid() = client_id);

-- Le client peut annuler sa course tant qu'aucun coursier ne l'a acceptée.
drop policy if exists "Client annule sa course en attente" on public.express_courses;
create policy "Client annule sa course en attente"
on public.express_courses for update
to authenticated
using (auth.uid() = client_id and status = 'en_attente')
with check (auth.uid() = client_id);

-- Un coursier validé voit les courses disponibles (en_attente) et les siennes.
drop policy if exists "Coursier voit les courses disponibles et les siennes" on public.express_courses;
create policy "Coursier voit les courses disponibles et les siennes"
on public.express_courses for select
to authenticated
using (
  coursier_id = auth.uid()
  or (
    status = 'en_attente'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'coursier_express'
      and profiles.status = 'valide'
    )
  )
);

-- Un coursier validé peut accepter une course encore disponible.
drop policy if exists "Coursier accepte une course disponible" on public.express_courses;
create policy "Coursier accepte une course disponible"
on public.express_courses for update
to authenticated
using (
  status = 'en_attente'
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
    and profiles.role = 'coursier_express'
    and profiles.status = 'valide'
  )
)
with check (coursier_id = auth.uid());

-- Un coursier peut mettre à jour la course qu'il a acceptée (ex: marquer "livrée").
drop policy if exists "Coursier gere la course qu il a acceptee" on public.express_courses;
create policy "Coursier gere la course qu il a acceptee"
on public.express_courses for update
to authenticated
using (coursier_id = auth.uid())
with check (coursier_id = auth.uid());

-- Équipe et admin voient et gèrent toutes les courses (supervision, litiges,
-- pointage des commissions reversées).
drop policy if exists "Equipe et admin lisent toutes les courses" on public.express_courses;
create policy "Equipe et admin lisent toutes les courses"
on public.express_courses for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
    and profiles.role in ('equipe', 'admin')
  )
);

drop policy if exists "Equipe et admin gerent toutes les courses" on public.express_courses;
create policy "Equipe et admin gerent toutes les courses"
on public.express_courses for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
    and profiles.role in ('equipe', 'admin')
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
    and profiles.role in ('equipe', 'admin')
  )
);

-- Active la diffusion en temps réel : les coursiers disponibles voient
-- apparaître une nouvelle demande instantanément, sans recharger la page.
alter publication supabase_realtime add table public.express_courses;


-- ----------------------------------------------------------------------------
-- 4. Stockage privé pour la pièce d'identité envoyée par le coursier lors
--    de son inscription (consultée uniquement par l'équipe/admin pour
--    valider le compte, jamais publique).
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('express-kyc', 'express-kyc', false)
on conflict (id) do nothing;

drop policy if exists "Coursier envoie sa propre piece d identite" on storage.objects;
create policy "Coursier envoie sa propre piece d identite"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'express-kyc'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Coursier lit sa propre piece d identite" on storage.objects;
create policy "Coursier lit sa propre piece d identite"
on storage.objects for select
to authenticated
using (
  bucket_id = 'express-kyc'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Equipe et admin lisent toutes les pieces d identite" on storage.objects;
create policy "Equipe et admin lisent toutes les pieces d identite"
on storage.objects for select
to authenticated
using (
  bucket_id = 'express-kyc'
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
    and profiles.role in ('equipe', 'admin')
  )
);


-- ----------------------------------------------------------------------------
-- 5. Correctif : autoriser les Edge Functions (clé service role) à définir
--    le rôle/statut du profil lors de l'inscription CLT Express.
-- ----------------------------------------------------------------------------
-- Un trigger existant sur auth.users ("on_auth_user_created" -> handle_new_user())
-- crée automatiquement une ligne dans public.profiles dès la création du compte
-- auth (avec role = 'fournisseur' par défaut). Les Edge Functions
-- inscrire-client-express / inscrire-coursier-express font donc un UPSERT (et
-- non un INSERT) pour écraser cette ligne par défaut avec le bon rôle
-- ('client_express' / 'coursier_express').
--
-- Ce UPSERT-en-UPDATE se heurtait au trigger de garde
-- "trg_prevent_role_change" -> prevent_role_change_by_non_admin(), qui bloquait
-- TOUT changement de rôle non fait par un admin — y compris les appels
-- service role (sans auth.uid()), provoquant l'erreur "Seul un administrateur
-- peut modifier le role d'un compte." lors de chaque inscription.
--
-- Correctif : n'appliquer cette garde que lorsqu'un utilisateur authentifié
-- (auth.uid() non nul) est à l'origine du changement, exactement comme le
-- fait déjà le trigger jumeau prevent_profile_privileged_change(). Les
-- utilisateurs non-admin authentifiés restent totalement bloqués pour
-- modifier leur propre rôle ; seuls les appels service role (Edge Functions)
-- sont désormais exemptés.
create or replace function public.prevent_role_change_by_non_admin()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null and new.role is distinct from old.role then
    if not is_admin() then
      raise exception 'Seul un administrateur peut modifier le role d''un compte.';
    end if;
  end if;
  return new;
end;
$function$;
