-- =============================================================================
-- CLT Express — Espace « Mon compte » (clients & coursiers)
-- Christ Livraison & Transport SARL
--
-- Ce script ajoute le nécessaire pour la demande de suppression de compte.
-- Le changement de nom, de photo et de numéro passe par des colonnes déjà
-- existantes (full_name, avatar_url, phone) et la policy « l'utilisateur met à
-- jour son propre profil » déjà en place (utilisée pour disponible_express,
-- avatar_url, etc.). Aucune nouvelle policy n'est donc requise pour ces trois-là.
--
-- Suppression de compte : on NE supprime JAMAIS automatiquement le compte depuis
-- le navigateur (irréversible, et lié à des courses/soldes). L'utilisateur pose
-- une « demande de suppression » : on horodate simplement suppression_demandee_at
-- sur son profil. L'équipe voit la demande dans son espace et traite le compte
-- manuellement. L'utilisateur peut aussi annuler sa demande (remise à NULL).
--
-- Idempotent : peut être relancé sans risque.
-- =============================================================================

alter table public.profiles
  add column if not exists suppression_demandee_at timestamptz;

comment on column public.profiles.suppression_demandee_at is
  'Horodatage de la demande de suppression de compte faite par l''utilisateur lui-même depuis « Mon compte ». NULL = aucune demande en cours. L''équipe traite la suppression effective manuellement.';
