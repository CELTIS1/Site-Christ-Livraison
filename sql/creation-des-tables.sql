-- sql/creation-des-tables.sql — LES TROIS TABLES QUI PORTENT L'ENTREPRISE (20/09/2026, lot 20.H)
-- ==========================================================================================
-- profiles (les comptes), colis (le travail), activity_log (la trace). Ce script recrée leur
-- forme EXACTE telle qu'elle est en production le 20 septembre 2026 (relevée dans le
-- catalogue, pas recopiée de mémoire) : c'est ce qu'il faut pour rejouer une sauvegarde sur une
-- base vide, ou pour comprendre la maison sans ouvrir Supabase. Les règles d'accès (RLS), les
-- déclencheurs et les fonctions sont dans les migrations de _sql-prive/ ; la sauvegarde nocturne
-- (pg_dump, voir sauvegarde/README.md) les emporte toutes de toute façon.
--
-- Rejouable : « if not exists » partout, aucune donnée touchée.
-- ==========================================================================================

create extension if not exists pgcrypto;

-- Un compte : id = auth.users.id (Supabase Auth). role : fournisseur (cliente), livreur, equipe, admin, client_express, coursier.
create table if not exists public.profiles (
  id uuid not null,
  role text not null default 'fournisseur'::text,
  full_name text,
  company_name text,
  phone text,
  created_at timestamptz default now(),
  status text not null default 'valide'::text,
  avatar_url text,
  commune_recuperation text,
  adresse_recuperation text,
  geoloc_consent_at timestamptz,
  disponible_express boolean not null default false,
  piece_identite_path text,
  suppression_demandee_at timestamptz,
  acces_paie boolean not null default false,
  acces_compta boolean not null default false,
  acces_operations boolean not null default false,
  suspendu_at timestamptz,
  suspendu_par uuid,
  suspendu_motif text,
  statut_avant_suspension text,
  telephone_verifie_at timestamptz,
  express_adresses jsonb not null default '[]'::jsonb,
  primary key (id)
);

-- Un colis : de la saisie à la remise de l'argent. statut : en_attente, recupere, en_livraison, livre, non_livre, retour.
create table if not exists public.colis (
  id uuid not null default gen_random_uuid(),
  fournisseur_id uuid not null,
  description text,
  photo_url text,
  statut text not null default 'en_attente'::text,
  destination text,
  livreur_nom text,
  note_interne text,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now(),
  livreur_id uuid,
  observation text,
  photo_livraison_url text,
  montant numeric,
  numero text not null,
  montant_article numeric,
  montant_livraison numeric,
  article_paye boolean not null default false,
  livraison_payee boolean not null default false,
  commune_destination text,
  commune_recuperation text,
  adresse_recuperation text,
  livreur_collecte_id uuid,
  collecte_depart_at timestamptz,
  destinataire_telephone text,
  code_confirmation text,
  code_confirme_at timestamptz,
  encaissement_remis boolean not null default false,
  encaissement_remis_at timestamptz,
  tentatives_livraison integer not null default 0,
  creneau_estime text,
  cle_creation text,
  livre_at timestamptz,
  article_non_encaisse boolean not null default false,
  livraison_non_encaissee boolean not null default false,
  reverse_au_fournisseur_at timestamptz,
  frais_expedition numeric,
  frais_expedition_rembourse_at timestamptz,
  recupere_at timestamptz,
  non_livre_at timestamptz,
  retour_at timestamptz,
  jour_recuperation_prevu date,
  frais_soldes_at timestamptz,
  a_livrer_avant date,
  reporte_au date,
  motif_non_livraison text,
  vendeuse_prevenue boolean not null default false,
  echec_imputable boolean,
  echec_qualifie_at timestamptz,
  echec_qualifie_par uuid,
  cree_par uuid,
  cree_par_role text,
  frais_additionnels_montant numeric,
  frais_additionnels_motif text,
  frais_additionnels_regle_at timestamptz,
  retour_rendu_at timestamptz,
  retour_rendu_par uuid,
  en_livraison_at timestamptz,
  livraison_payee_non_livre boolean not null default false,
  retour_detenteur text,
  retour_detenteur_livreur_id uuid,
  retour_rendu_photo_url text,
  retour_confirme_at timestamptz,
  retour_conteste_at timestamptz,
  retour_conteste_texte text,
  vu_par_bureau_at timestamptz,
  primary key (id)
);

-- La trace : qui a fait quoi, sur quoi, avec quel détail (jsonb).
create table if not exists public.activity_log (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid,
  actor_role text,
  action text not null,
  target_id uuid,
  target_type text,
  details jsonb,
  primary key (id)
);

-- Les clés étrangères, telles qu'elles existent (nommées pour être retrouvées).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'colis_fournisseur_id_fkey') then
    alter table public.colis add constraint colis_fournisseur_id_fkey foreign key (fournisseur_id) references public.profiles(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'colis_livreur_id_fkey') then
    alter table public.colis add constraint colis_livreur_id_fkey foreign key (livreur_id) references public.profiles(id);
  end if;
end $$;

-- Les index qui comptent au quotidien (la liste d'une cliente, la journée d'un livreur, un numéro).
create unique index if not exists colis_numero_idx on public.colis (numero);
create index if not exists colis_fournisseur_created_idx on public.colis (fournisseur_id, created_at desc);
create index if not exists colis_livreur_created_idx on public.colis (livreur_id, created_at desc);
create index if not exists colis_statut_idx on public.colis (statut);
create index if not exists activity_log_created_idx on public.activity_log (created_at desc);
create index if not exists activity_log_target_idx on public.activity_log (target_id);

alter table public.profiles enable row level security;
alter table public.colis enable row level security;
alter table public.activity_log enable row level security;
