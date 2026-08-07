-- ============================================================================
-- CLT Express — Photo du colis + Système de solde coursier (portefeuille)
-- ============================================================================
-- À exécuter UNE SEULE FOIS dans Supabase : Dashboard > SQL Editor > New query
-- (copier-coller tout ce fichier, puis "Run"). Le script est idempotent : il
-- peut être relancé sans risque (add column if not exists, drop/create policy...).
--
-- Ce qu'il ajoute, sans rien casser de l'existant :
--   1. PHOTO DU COLIS : une colonne photo_colis_path sur express_courses + un
--      espace de stockage public "express-colis" (le client prend/ajoute une
--      photo du colis à la commande, le coursier la voit).
--   2. SOLDE COURSIER (comme Yango) : chaque coursier a un solde prépayé. La
--      commission de chaque course livrée est automatiquement déduite de ce
--      solde. Un coursier doit garder un solde >= solde_minimum pour pouvoir
--      accepter des courses.
--   3. RECHARGES Mobile Money : le coursier déclare un envoi (Wave / Orange
--      Money / MTN / Moov) vers le numéro de CLT ; l'équipe/admin valide ->
--      le solde est crédité automatiquement.
--   4. HISTORIQUE (ledger) de tous les mouvements de portefeuille.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. PHOTO DU COLIS
-- ----------------------------------------------------------------------------
alter table public.express_courses
  add column if not exists photo_colis_path text;
comment on column public.express_courses.photo_colis_path is
  'Chemin, dans le bucket public "express-colis", de la photo du colis prise ou ajoutée par le client au moment de la commande. Optionnel.';

-- Bucket public : la photo d'un colis n'est pas une donnée sensible et le
-- coursier doit pouvoir l'afficher sans authentification complexe. Le nom de
-- fichier contient un identifiant aléatoire (non devinable).
insert into storage.buckets (id, name, public)
values ('express-colis', 'express-colis', true)
on conflict (id) do update set public = true;

-- Envoi : seul l'utilisateur connecté, et uniquement dans son propre dossier.
drop policy if exists "Client envoie la photo de son colis" on storage.objects;
create policy "Client envoie la photo de son colis"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'express-colis'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Lecture publique (bucket public) — nécessaire pour que le coursier affiche la photo.
drop policy if exists "Lecture publique des photos de colis" on storage.objects;
create policy "Lecture publique des photos de colis"
on storage.objects for select
to public
using (bucket_id = 'express-colis');


-- ----------------------------------------------------------------------------
-- 2. express_config — solde minimum + numéros Mobile Money de CLT
-- ----------------------------------------------------------------------------
alter table public.express_config
  add column if not exists solde_minimum numeric not null default 0;
comment on column public.express_config.solde_minimum is
  'Solde minimum (FCFA) qu''un coursier doit conserver pour pouvoir accepter des courses. Réglable par l''équipe/admin. La commission de chaque course livrée est déduite du solde du coursier.';

alter table public.express_config add column if not exists momo_wave text;
alter table public.express_config add column if not exists momo_orange text;
alter table public.express_config add column if not exists momo_mtn text;
alter table public.express_config add column if not exists momo_moov text;
comment on column public.express_config.momo_wave is
  'Numéro Wave de CLT Express sur lequel les coursiers envoient leur recharge (affiché dans l''app coursier). À renseigner par l''équipe/admin.';

-- Renseignez ici vos vrais numéros Mobile Money (ceux qui reçoivent les recharges).
-- Laissez NULL un opérateur que vous n'utilisez pas : il ne sera pas proposé.
update public.express_config set
  momo_wave   = coalesce(momo_wave,   null),
  momo_orange = coalesce(momo_orange, null),
  momo_mtn    = coalesce(momo_mtn,    null),
  momo_moov   = coalesce(momo_moov,   null)
where id = 1;


-- ----------------------------------------------------------------------------
-- 3. express_wallets — solde prépayé de chaque coursier
-- ----------------------------------------------------------------------------
-- Table dédiée (plutôt qu'une colonne sur profiles) pour que le coursier ne
-- puisse JAMAIS modifier lui-même son solde : aucune policy insert/update n'est
-- accordée. Seules les fonctions SECURITY DEFINER (recharge validée / course
-- livrée) écrivent dans cette table.
create table if not exists public.express_wallets (
  coursier_id uuid primary key references public.profiles(id) on delete cascade,
  solde numeric not null default 0,
  updated_at timestamptz not null default now()
);
comment on table public.express_wallets is
  'Solde prépayé de chaque coursier CLT Express. Crédité par les recharges validées, débité de la commission à chaque course livrée. Modifié uniquement par des fonctions SECURITY DEFINER — jamais directement par le coursier.';

alter table public.express_wallets enable row level security;

drop policy if exists "Coursier lit son propre solde" on public.express_wallets;
create policy "Coursier lit son propre solde"
on public.express_wallets for select
to authenticated
using (coursier_id = auth.uid());

drop policy if exists "Equipe et admin lisent tous les soldes" on public.express_wallets;
create policy "Equipe et admin lisent tous les soldes"
on public.express_wallets for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('equipe', 'admin')
  )
);
-- (Volontairement : aucune policy insert/update/delete.)


-- ----------------------------------------------------------------------------
-- 4. express_wallet_transactions — historique (ledger) des mouvements
-- ----------------------------------------------------------------------------
create table if not exists public.express_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  coursier_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,                 -- 'recharge' | 'commission'
  montant numeric not null,           -- + pour une recharge, - pour une commission
  solde_apres numeric,
  course_id uuid references public.express_courses(id) on delete set null,
  recharge_id uuid,
  created_at timestamptz not null default now()
);
comment on table public.express_wallet_transactions is
  'Historique des mouvements du portefeuille coursier : recharges validées (montant positif) et commissions déduites à la livraison (montant négatif).';
create index if not exists express_wallet_tx_coursier_idx
  on public.express_wallet_transactions(coursier_id, created_at desc);

alter table public.express_wallet_transactions enable row level security;

drop policy if exists "Coursier lit son propre historique" on public.express_wallet_transactions;
create policy "Coursier lit son propre historique"
on public.express_wallet_transactions for select
to authenticated
using (coursier_id = auth.uid());

drop policy if exists "Equipe et admin lisent tout l historique wallet" on public.express_wallet_transactions;
create policy "Equipe et admin lisent tout l historique wallet"
on public.express_wallet_transactions for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('equipe', 'admin')
  )
);


-- ----------------------------------------------------------------------------
-- 5. express_recharges — demandes de recharge Mobile Money
-- ----------------------------------------------------------------------------
create table if not exists public.express_recharges (
  id uuid primary key default gen_random_uuid(),
  coursier_id uuid not null references public.profiles(id) on delete cascade,
  montant numeric not null check (montant > 0),
  operateur text not null,            -- 'wave' | 'orange' | 'mtn' | 'moov'
  reference text,                     -- référence de la transaction Mobile Money déclarée
  status text not null default 'en_attente', -- 'en_attente' | 'validee' | 'refusee'
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  validated_by uuid references public.profiles(id) on delete set null
);
comment on table public.express_recharges is
  'Demandes de recharge du solde coursier via Mobile Money. Le coursier envoie l''argent au numéro CLT puis déclare la transaction (montant + référence). L''équipe/admin valide -> le solde est crédité automatiquement (trigger express_crediter_recharge).';
create index if not exists express_recharges_coursier_idx
  on public.express_recharges(coursier_id, created_at desc);
create index if not exists express_recharges_status_idx
  on public.express_recharges(status);

alter table public.express_recharges enable row level security;

drop policy if exists "Coursier cree sa demande de recharge" on public.express_recharges;
create policy "Coursier cree sa demande de recharge"
on public.express_recharges for insert
to authenticated
with check (coursier_id = auth.uid() and status = 'en_attente');

drop policy if exists "Coursier lit ses recharges" on public.express_recharges;
create policy "Coursier lit ses recharges"
on public.express_recharges for select
to authenticated
using (coursier_id = auth.uid());

drop policy if exists "Equipe et admin lisent les recharges" on public.express_recharges;
create policy "Equipe et admin lisent les recharges"
on public.express_recharges for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('equipe', 'admin')
  )
);

drop policy if exists "Equipe et admin valident les recharges" on public.express_recharges;
create policy "Equipe et admin valident les recharges"
on public.express_recharges for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('equipe', 'admin')
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('equipe', 'admin')
  )
);


-- ----------------------------------------------------------------------------
-- 6. Triggers : débit de commission à la livraison, crédit à la validation
-- ----------------------------------------------------------------------------

-- Quand une course passe à 'livree', on déduit sa commission du solde du
-- coursier et on l'inscrit à l'historique. SECURITY DEFINER : la fonction écrit
-- dans express_wallets / express_wallet_transactions même si le coursier n'y a
-- aucun droit d'écriture direct.
create or replace function public.express_regler_commission_solde()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_solde numeric;
begin
  if new.status = 'livree'
     and old.status is distinct from 'livree'
     and new.coursier_id is not null then

    insert into public.express_wallets (coursier_id, solde)
      values (new.coursier_id, 0)
      on conflict (coursier_id) do nothing;

    update public.express_wallets
      set solde = solde - coalesce(new.commission_montant, 0),
          updated_at = now()
      where coursier_id = new.coursier_id
      returning solde into v_solde;

    insert into public.express_wallet_transactions
      (coursier_id, type, montant, solde_apres, course_id)
      values (new.coursier_id, 'commission',
              -coalesce(new.commission_montant, 0), v_solde, new.id);

    -- La commission est réglée via le portefeuille prépayé.
    new.commission_reglee := true;
  end if;
  return new;
end;
$$;

drop trigger if exists express_courses_regler_commission on public.express_courses;
create trigger express_courses_regler_commission
before update on public.express_courses
for each row execute function public.express_regler_commission_solde();


-- Quand une recharge passe à 'validee', on crédite le solde du coursier.
create or replace function public.express_crediter_recharge()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_solde numeric;
begin
  if new.status = 'validee'
     and old.status is distinct from 'validee' then

    insert into public.express_wallets (coursier_id, solde)
      values (new.coursier_id, 0)
      on conflict (coursier_id) do nothing;

    update public.express_wallets
      set solde = solde + new.montant,
          updated_at = now()
      where coursier_id = new.coursier_id
      returning solde into v_solde;

    insert into public.express_wallet_transactions
      (coursier_id, type, montant, solde_apres, recharge_id)
      values (new.coursier_id, 'recharge', new.montant, v_solde, new.id);

    new.validated_at := now();
    if new.validated_by is null then
      new.validated_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists express_recharges_crediter on public.express_recharges;
create trigger express_recharges_crediter
before update on public.express_recharges
for each row execute function public.express_crediter_recharge();


-- ----------------------------------------------------------------------------
-- 7. Contrôle du solde minimum pour accepter une course
-- ----------------------------------------------------------------------------
-- On remplace la policy d'acceptation existante en ajoutant la condition :
-- le coursier doit avoir un solde >= solde_minimum. (Un coursier peut toujours
-- terminer/livrer une course déjà acceptée : c'est la policy "gere la course
-- qu'il a acceptee" qui s'en charge, elle n'est pas touchée.)
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
  and coalesce((select solde from public.express_wallets where coursier_id = auth.uid()), 0)
      >= coalesce((select solde_minimum from public.express_config where id = 1), 0)
)
with check (coursier_id = auth.uid());


-- ----------------------------------------------------------------------------
-- 8. Temps réel (Realtime) pour recharges et soldes
-- ----------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.express_recharges;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.express_wallets;
exception when duplicate_object then null; end $$;
