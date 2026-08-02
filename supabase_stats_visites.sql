-- ============================================================================
-- Christ Livraison & Transport SARL — Compteur de visites du site public
-- ============================================================================
-- À exécuter UNE SEULE FOIS dans Supabase : Dashboard > SQL Editor > New query
-- (copier-coller tout ce fichier, puis cliquer sur "Run").
--
-- Ce script crée une table "site_visits" qui enregistre chaque visite du site
-- public (index.html), sans jamais stocker de données personnelles : aucune
-- adresse IP, aucun nom, aucun e-mail. Seul un identifiant anonyme (généré au
-- hasard dans le navigateur du visiteur) et la date de la visite sont gardés,
-- ce qui permet de compter le nombre de visites sans pouvoir identifier qui
-- que ce soit.
-- ============================================================================

create table if not exists public.site_visits (
  id bigint generated always as identity primary key,
  visited_at timestamptz not null default now(),
  visitor_id text not null,
  page text not null default 'index'
);

-- Active la sécurité au niveau des lignes (obligatoire avant de définir des règles d'accès).
alter table public.site_visits enable row level security;

-- Règle 1 : n'importe quel visiteur du site public peut enregistrer SA visite
-- (mais ne peut ni lire, ni modifier, ni supprimer les visites des autres).
drop policy if exists "Insertion publique des visites" on public.site_visits;
create policy "Insertion publique des visites"
on public.site_visits for insert
to anon
with check (true);

-- Règle 2 : seuls les comptes "équipe" et "admin" connectés peuvent consulter
-- le nombre de visites (dans la section Statistiques du tableau de bord équipe).
drop policy if exists "Lecture reservee a l equipe et l admin" on public.site_visits;
create policy "Lecture reservee a l equipe et l admin"
on public.site_visits for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
    and profiles.role in ('equipe', 'admin')
  )
);

-- Index pour accélérer les statistiques "aujourd'hui" / "ce mois-ci".
create index if not exists site_visits_visited_at_idx on public.site_visits (visited_at);
