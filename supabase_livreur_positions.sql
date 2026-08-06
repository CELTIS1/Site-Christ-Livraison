-- Migration : suivi de position en temps réel des livreurs (carte équipe/admin)
-- À exécuter une seule fois dans Supabase > SQL Editor sur le projet du site.
--
-- Principe : une seule ligne par livreur (upsert), mise à jour à chaque envoi de position.
-- Le livreur active/désactive lui-même le partage depuis son espace (aucun suivi caché).

create table if not exists public.livreur_positions (
  livreur_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision,
  updated_at timestamptz not null default now()
);

comment on table public.livreur_positions is
  'Dernière position connue de chaque livreur, envoyée uniquement quand il active le partage depuis son espace. Une ligne = un livreur (upsert).';

-- Row Level Security : personne ne peut lire/écrire sans y être explicitement autorisé.
alter table public.livreur_positions enable row level security;

-- Un livreur ne peut écrire (insérer/modifier/supprimer) que SA PROPRE position.
drop policy if exists "Livreur gere sa propre position" on public.livreur_positions;
create policy "Livreur gere sa propre position"
on public.livreur_positions for all
to authenticated
using (auth.uid() = livreur_id)
with check (auth.uid() = livreur_id);

-- Équipe et admin peuvent lire la position de tous les livreurs (pour la carte).
drop policy if exists "Equipe et admin lisent toutes les positions" on public.livreur_positions;
create policy "Equipe et admin lisent toutes les positions"
on public.livreur_positions for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
    and profiles.role in ('equipe', 'admin')
  )
);

-- Active la diffusion en temps réel (Realtime) des changements de cette table,
-- indispensable pour que la carte se mette à jour automatiquement sans recharger la page.
alter publication supabase_realtime add table public.livreur_positions;
