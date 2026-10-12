-- abonnement : objet quota/paiement (Phase 1 — modèle de données + compteur,
-- sans paiement). Voir
-- docs/superpowers/specs/2026-10-12-abonnement-quota-phase1-design.md

create type plan_abonnement as enum ('decouverte', 'starter', 'croissance', 'cabinet');
create type statut_abonnement as enum ('actif', 'suspendu');
create type mode_facturation_abonnement as enum ('mensuel', 'annuel');

create table abonnement (
  entreprise_id uuid primary key references entreprise(id) on delete cascade,
  plan plan_abonnement not null default 'cabinet',
  quota_mensuel integer not null default 60,
  statut statut_abonnement not null default 'actif',
  date_renouvellement timestamptz,
  mode_facturation mode_facturation_abonnement,
  created_at timestamptz not null default now()
);

alter table abonnement enable row level security;

-- Lecture par tout membre de l'entreprise. Pas de policy d'écriture pour
-- authenticated : en Phase 1, seule une connexion service_role (ou une
-- requête SQL directe par le Directeur) peut modifier une ligne — voir
-- spec "Logique de quota" / "Hors scope".
create policy "abonnement_select_membres" on abonnement
  for select using (
    entreprise_id = utilisateur_entreprise_id(auth.uid())
  );

-- Backfill : chaque entreprise déjà existante reçoit le palier par défaut
-- (cabinet / 60), choisi pour ne bloquer aucun pilote actuel.
insert into abonnement (entreprise_id)
select id from entreprise
on conflict (entreprise_id) do nothing;

-- Étend creer_entreprise (20260822124743) pour insérer aussi la ligne
-- abonnement par défaut, dans la même transaction — même signature,
-- create or replace suffit.
create or replace function creer_entreprise(
  p_nom text,
  p_rccm text default null,
  p_nom_utilisateur text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entreprise_id uuid;
begin
  if exists (select 1 from utilisateur where id = auth.uid()) then
    raise exception 'utilisateur_deja_rattache';
  end if;

  insert into entreprise (nom, rccm) values (p_nom, p_rccm)
  returning id into v_entreprise_id;

  insert into utilisateur (id, entreprise_id, nom, role)
  values (auth.uid(), v_entreprise_id, p_nom_utilisateur, 'admin');

  insert into abonnement (entreprise_id) values (v_entreprise_id);

  return v_entreprise_id;
end;
$$;
