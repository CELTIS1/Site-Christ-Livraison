-- Migration : suivi du livreur pendant la phase de RÉCUPÉRATION (avant que le colis soit marqué
-- "recupere"), avec un livreur de collecte potentiellement différent du livreur de livraison.
--
-- Contexte métier : pour la récupération, un même livreur va chercher TOUS les colis en attente
-- d'une même vendeuse/cliente en une seule tournée. Pour la livraison, chaque colis est ensuite
-- attribué individuellement (le champ existant colis.livreur_id), parfois à un autre livreur.
-- Ces deux étapes utilisaient jusqu'ici le même champ livreur_id, ce qui ne permettait pas de
-- distinguer "qui va récupérer" de "qui va livrer", ni de démarrer le suivi GPS avant que le
-- colis soit physiquement récupéré.
--
-- À exécuter une seule fois dans Supabase > SQL Editor sur le projet du site.

alter table public.colis add column if not exists livreur_collecte_id uuid references public.profiles(id);
alter table public.colis add column if not exists collecte_depart_at timestamptz;

comment on column public.colis.livreur_collecte_id is
  'Livreur chargé d''aller récupérer ce colis chez le client/vendeuse. Assigné en une fois (par l''équipe/admin) pour tous les colis en attente d''une même vendeuse. Distinct de colis.livreur_id, qui reste le livreur chargé de la LIVRAISON (peut être la même personne ou une autre).';

comment on column public.colis.collecte_depart_at is
  'Horodatage auquel le livreur de collecte a cliqué "Je pars pour cette récupération" (app/livreur.html). Sert uniquement à démarrer le partage de position pendant le trajet réel vers la récupération, jamais avant. Remis à NULL automatiquement dès que les colis sont marqués "récupéré" (minimisation des données).';

create index if not exists colis_livreur_collecte_id_idx on public.colis(livreur_collecte_id);
